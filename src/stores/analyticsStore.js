import { writable } from 'svelte/store'
import { addGame, getLastRecentGame, getPlayTimeSince4AM } from '../lib/gamedb'
import { formatSeconds } from '../lib/utils'
import { probit } from 'simple-statistics';

const calculateDPrime = (hits, misses, fas, nonTargets) => {
  // 1. Apply Hautus Correction (You still need this!)
  // Libraries will return Infinity for 1 and -Infinity for 0, so 
  // keeping your correction logic is crucial.
  const hitRate = (hits + 0.5) / (hits + misses + 1);
  const faRate = (fas + 0.5) / (nonTargets + 1);

  // 2. Calculate d' using the library
  // probit(p) is the standard normal inverse CDF
  return probit(hitRate) - probit(faRate);
}
function dPerformance(scoresheet) {
  // 2. Parse Scoresheet to get Counts
  let hits = 0;
  let misses = 0;
  let fas = 0; // Combined Lure FAs and Random FAs
  let nonTargets = 0;
  // Iterate over every trial in the scoresheet
  scoresheet.forEach(trial => {
    if (!trial) return;
    Object.values(trial).forEach(status => {
      if (status === 'hit') hits++;
      else if (status === 'miss') misses++;
      else if (status === 'lure-fa' || status === 'random-fa') fas++;
      else if (status === 'non-target') nonTargets++;
    });
  });

  const totalNonTargets = nonTargets;

  // 3. Calculate d' (Sensitivity)
  return calculateDPrime(hits, misses, fas, nonTargets);
}
const loadAnalytics = async () => {
  const lastGame = await getLastRecentGame()
  console.log(lastGame)
  const playTime = await getPlayTimeSince4AM()

  return {
    lastGame,
    playTime: playTime > 0 ? formatSeconds(playTime) : null,
  }
}

const createAnalyticsStore = () => {
  const { subscribe, set } = writable({})

  loadAnalytics().then(analytics => set(analytics))
  return {
    subscribe,
    scoreTrials: async (gameInfo, scoresheet, status) => {
      const scores = {}
      for (const tag of gameInfo.tags) {
        scores[tag] = { hits: 0, misses: 0 }
      }

      for (const answers of scoresheet) {
        for (const tag of gameInfo.tags) {
          if (tag in answers) {
            if (answers[tag] === 'hit') {
              scores[tag].hits++
            } else {
              if (answers[tag] !== 'non-target')
                scores[tag].misses++
            }
          }
        }
      }
      const dp = dPerformance(scoresheet)
      await addGame({
        ...gameInfo,
        scores,
        dp,
        completedTrials: scoresheet.length,
        status
      })
      set(await loadAnalytics())
    },

    scoreTallyTrials: async (gameInfo, scoresheet, status) => {
      const scores = { tally: { hits: 0, misses: 0 } }

      scores.tally.hits = scoresheet.filter(answers => answers.success && answers.count > 0).length
      scores.tally.possible = scoresheet.filter(answers => answers.count > 0 || ('success' in answers && answers.success === false)).length

      await addGame({
        ...gameInfo,
        scores,
        completedTrials: scoresheet.length,
        status,
      })
      set(await loadAnalytics())
    }
  }
}

export const analytics = createAnalyticsStore()
