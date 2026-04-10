#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
# PulseCoach health check & crash tracker
# Usage: ./scripts/health-check.sh [--full]

set -euo pipefail

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
CYN='\033[0;36m'
RST='\033[0m'

LOG_DIR="${HOME}/.local/share/garmin-coach"
CRASH_LOG="${LOG_DIR}/crash-history.csv"
mkdir -p "${LOG_DIR}"

# Initialize crash log if missing
if [ ! -f "${CRASH_LOG}" ]; then
    echo "timestamp,boot_id,classification,uptime_hours,last_log" > "${CRASH_LOG}"
fi

echo -e "${CYN}═══ PulseCoach System Health Check ═══${RST}"
echo ""

# 1. System overview
echo -e "${CYN}▸ System${RST}"
uptime_str=$(uptime -p)
mem_info=$(free -h | awk '/^Mem:/ {printf "%s used / %s total (%s available)", $3, $2, $7}')
echo "  Uptime: ${uptime_str}"
echo "  Memory: ${mem_info}"
echo "  Load:   $(cat /proc/loadavg | awk '{print $1, $2, $3}') ($(nproc) cores)"

# 2. Disk health
echo ""
echo -e "${CYN}▸ Disk${RST}"
df -h / /home 2>/dev/null | awk 'NR>1 {
    use=int($5)
    if (use > 90) color="\033[0;31m"
    else if (use > 75) color="\033[1;33m"
    else color="\033[0;32m"
    printf "  %-40s %s%s%%\033[0m used (%s avail)\n", $6, color, use, $4
}'

# 3. NVMe health (if smartctl available)
if command -v smartctl &>/dev/null; then
    echo ""
    echo -e "${CYN}▸ NVMe Health${RST}"
    nvme_dev=$(lsblk -ndo NAME,TYPE | awk '$2=="disk" {print "/dev/"$1; exit}')
    if [ -n "${nvme_dev}" ]; then
        sudo smartctl -A "${nvme_dev}" 2>/dev/null | grep -iE "percentage|temperature|power_on" | head -5 | sed 's/^/  /'
    fi
fi

# 4. Docker containers
echo ""
echo -e "${CYN}▸ Docker Containers${RST}"
docker ps --format "  {{.Names}}: {{.Status}}" 2>/dev/null | sort
echo ""
echo "  Memory usage:"
docker stats --no-stream --format "  {{.Name}}: {{.MemUsage}} ({{.MemPerc}})" 2>/dev/null | sort

# 5. garmin-coach specific checks
echo ""
echo -e "${CYN}▸ PulseCoach Services${RST}"

# Postgres
if docker exec garmin-coach-postgres-1 pg_isready -U dev -d pulsecoach &>/dev/null; then
    row_count=$(docker exec garmin-coach-postgres-1 psql -U dev -d pulsecoach -tAc \
        "SELECT json_build_object(
            'daily_metrics', (SELECT count(*) FROM daily_metric),
            'activities', (SELECT count(*) FROM activity),
            'readiness_scores', (SELECT count(*) FROM readiness_score)
        );" 2>/dev/null || echo '{}')
    echo -e "  PostgreSQL: ${GRN}healthy${RST} — ${row_count}"
else
    echo -e "  PostgreSQL: ${RED}DOWN${RST}"
fi

# Redis
if docker exec garmin-coach-redis-1 redis-cli ping &>/dev/null; then
    redis_mem=$(docker exec garmin-coach-redis-1 redis-cli info memory 2>/dev/null | grep "used_memory_human" | tr -d '\r')
    echo -e "  Redis:      ${GRN}healthy${RST} — ${redis_mem}"
else
    echo -e "  Redis:      ${RED}DOWN${RST}"
fi

# Next.js dev server
http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "${http_code}" = "200" ]; then
    echo -e "  Next.js:    ${GRN}healthy${RST} (port 3000)"
else
    echo -e "  Next.js:    ${RED}DOWN${RST} (port 3000 → HTTP ${http_code})"
fi

# 6. Power status
echo ""
echo -e "${CYN}▸ Power${RST}"
ac_online=$(cat /sys/class/power_supply/ADP0/online 2>/dev/null || echo "?")
bat_status=$(cat /sys/class/power_supply/BAT0/status 2>/dev/null || echo "?")
bat_capacity=$(cat /sys/class/power_supply/BAT0/capacity 2>/dev/null || echo "?")
if [ "${ac_online}" = "1" ]; then
    echo -e "  AC: ${GRN}connected${RST}  Battery: ${bat_capacity}% (${bat_status})"
else
    echo -e "  AC: ${RED}disconnected${RST}  Battery: ${bat_capacity}% (${bat_status})"
    echo -e "  ${YEL}⚠ Running on battery — laptop may suspend and kill services${RST}"
fi

# 7. Boot/crash history analysis
echo ""
echo -e "${CYN}▸ Crash History (last 10 boots)${RST}"
journalctl --no-pager --list-boots 2>/dev/null | tail -11 | head -10 | while IFS= read -r line; do
    boot_idx=$(echo "$line" | awk '{print $1}')
    first=$(echo "$line" | awk '{print $3, $4, $5}')
    last=$(echo "$line" | awk '{print $6, $7, $8}')

    last_msg=$(journalctl --no-pager -b "$boot_idx" -n 1 --output=cat 2>/dev/null | head -1)

    # Simple classification
    case "$last_msg" in
        *"powering down"*|*"Journal stopped"*|*"SIGTERM"*)
            printf "  ${GRN}✓${RST} Boot %3s: %s → %s (graceful)\n" "$boot_idx" "$first" "$last"
            ;;
        *"Input/output error"*)
            printf "  ${RED}✗${RST} Boot %3s: %s → %s (I/O ERROR)\n" "$boot_idx" "$first" "$last"
            ;;
        *"password"*|*"Failed to process"*)
            printf "  ${YEL}⚠${RST} Boot %3s: %s → %s (boot fail)\n" "$boot_idx" "$first" "$last"
            ;;
        *)
            printf "  ${RED}💀${RST} Boot %3s: %s → %s (hard crash)\n" "$boot_idx" "$first" "$last"
            ;;
    esac
done

# 8. Full mode: detailed recommendations
if [ "${1:-}" = "--full" ]; then
    echo ""
    echo -e "${CYN}▸ Recommendations${RST}"

    # Check containers without memory limits
    unlim=$(docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} {{.HostConfig.Memory}}' {} 2>/dev/null | grep " 0$" | wc -l)
    if [ "$unlim" -gt 0 ]; then
        echo -e "  ${YEL}⚠ ${unlim} containers have no memory limit${RST}"
        docker ps -q 2>/dev/null | xargs -I{} docker inspect --format '{{.Name}} {{.HostConfig.Memory}}' {} 2>/dev/null | grep " 0$" | sed 's/\// /;s/ 0$//' | awk '{printf "    - %s\n", $1}'
    fi

    # Check s2idle
    sleep_mode=$(cat /sys/power/mem_sleep 2>/dev/null)
    if echo "$sleep_mode" | grep -q "s2idle"; then
        echo -e "  ${YEL}⚠ Sleep mode is s2idle — known problematic on AMD Ryzen.${RST}"
        echo "    Consider: sudo grubby --update-kernel=ALL --args='mem_sleep_default=deep'"
    fi

    # Memory pressure
    avail_gb=$(free -g | awk '/^Mem:/ {print $7}')
    if [ "$avail_gb" -lt 10 ]; then
        echo -e "  ${RED}⚠ Available memory below 10GB (${avail_gb}GB) — risk of OOM${RST}"
    fi
fi

echo ""
echo -e "${CYN}═══ Check complete ═══${RST}"
