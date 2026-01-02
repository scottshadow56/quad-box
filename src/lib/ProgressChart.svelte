<script>
  import { onMount, onDestroy } from 'svelte'
  import { Chart, registerables } from 'chart.js'
  import 'chartjs-adapter-date-fns'
  import { getAllCompletedGames } from '../lib/gamedb'
  import { settings } from '../stores/settingsStore'

  Chart.register(...registerables)
  Chart.defaults.font.family = 'Go Mono'
  Chart.defaults.font.size = 16
  Chart.defaults.font.weight = 'normal'
  let chart
  let canvas

  const getColorFromTitle = (title) => {
    let hash = 2166136261
    for (let i = 0; i < title.length; i++) {
      hash ^= title.charCodeAt(i)
      hash = (hash * 16777619) >>> 0
    }

    hash ^= hash >>> 13
    hash ^= hash << 7
    hash ^= hash >>> 17

    const hue = hash % 360
    const sat = 60 + (hash % 30)
    const light = $settings.theme === 'dark'
      ? 60 + (hash % 20)
      : 55 + (hash % 25)

    return `hsl(${hue}, ${sat}%, ${light}%)`
  }

 const getChartOptions = (theme) => {
  const isDark = theme === 'dark'
  return {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', tooltipFormat: 'PP' },
        ticks: { color: isDark ? '#ccc' : '#333' },
        grid: { color: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }
      },
      y: {
        // Left Axis for d'
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: "d' Performance", color: isDark ? '#eee' : '#111' },
        ticks: { color: isDark ? '#ccc' : '#333' },
        min: 0,
        suggestedMax: 4
      },
      yLevel: {
        // Right Axis for Level
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Progression N Level', color: isDark ? '#eee' : '#111' },
        ticks: { color: isDark ? '#ccc' : '#333' },
        min: 1,
        grid: { drawOnChartArea: false }, // Prevent grid clutter
      }
    },
    plugins: {
      legend: { labels: { color: isDark ? '#ccc' : '#333', usePointStyle: true } },
      tooltip: {
        mode: 'index', // Shows both d' and Level in the same tooltip
        intersect: false
      }
    }
  }
}

  const getDailyAveragesByTitle = (games) => {
    console.log(games)
  const grouped = {}

  for (const { scores, levelProgress, nBack, title, dayTimestamp } of games) {
    if (!title) continue
    const dp = scores?.dp || 0 + nBack;

    if (!grouped[title]) grouped[title] = {}
    if (!grouped[title][dayTimestamp]) grouped[title][dayTimestamp] = { dps: [], levels: [] }

    grouped[title][dayTimestamp].dps.push(dp)
    grouped[title][dayTimestamp].levels.push(levelProgress || 0)
  }

  const datasets = []

  Object.entries(grouped).forEach(([title, dayGroup]) => {
    const color = getColorFromTitle(title);
    
    const dpData = []
    const lvData = []

    Object.entries(dayGroup).forEach(([ts, vals]) => {
      const date = new Date(Number(ts))
      date.setHours(0, 0, 0, 0)
      
      dpData.push({ x: date, y: vals.dps.reduce((a, b) => a + b, 0) / vals.dps.length })
      lvData.push({ x: date, y: vals.levels.reduce((a, b) => a + b, 0) / vals.levels.length })
    })

    // Dataset 1: d' Performance
    datasets.push({
      label: `${title} (d')`,
      data: dpData,
      borderColor: color,
      backgroundColor: color,
      yAxisID: 'y', // Left axis
      borderWidth: 3,
      tension: 0.3
    })

    // Dataset 2: Level Progress
    datasets.push({
      label: `${title} (Level)`,
      data: lvData,
      borderColor: color,
      borderDash: [5, 5], // Dashed line to distinguish from d'
      yAxisID: 'yLevel', // Right axis
      borderWidth: 2,
      pointStyle: 'rect',
      opacity: 0.7
    })
  })

  return datasets
}

  onMount(async () => {
  // Filter for games that have either a d-prime score or level progress
  const games = (await getAllCompletedGames()).filter(game => 
    (game.scores && 'dp' in game.scores) || 'levelProgress' in game
  )
  
  const datasets = getDailyAveragesByTitle(games)

  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    options: getChartOptions($settings.theme),
  })
})

  const handleResize = () => {
    if (chart) {
      chart.resize()
    }
  }
  window.addEventListener('resize', handleResize)

  onDestroy(() => {
    if (chart) {
      chart.destroy()
    }
    window.removeEventListener('resize', handleResize)
  })
</script>

<canvas bind:this={canvas}></canvas>

<style>
</style>