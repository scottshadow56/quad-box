import { getLast48HoursGames, addGame } from './gamedb'
import { get } from 'svelte/store'
import { autoProgression } from '../stores/autoProgressionStore'
import { settings } from '../stores/settingsStore'
import { gameSettings } from '../stores/gameSettingsStore'
import { probit } from 'simple-statistics';


const takeUntil = (array, condition) => {
  const i = array.findIndex(condition)
  return array.slice(0, i === -1 ? array.length : i)
}

const calculateDPrime = (hits, misses, fas, nonTargets) => {
  // 1. Apply Hautus Correction (You still need this!)
  // Libraries will return Infinity for 1 and -Infinity for 0, so 
  // keeping your correction logic is crucial.
  const hitRate = (hits + 0.5) / (hits + misses + 1);
  const faRate = (fas + 0.5) / (nonTargets + 1);

  // 2. Calculate d' using the library
  // probit(p) is the standard normal inverse CDF
  return probit(hitRate) - probit(faRate);
};

// The Difficulty Engine: Converts Progress (0.0 - 1.0) into Game Settings
const getDifficultyParams = (p) => {
  // Clamp p between 0 and 1
  const progress = Math.max(0, Math.min(1, p));

  return {
    // Match Chance: Drops from 25% -> 12.5% (Exponential Decay)
    matchChance: Math.round(25 * Math.pow(0.5, progress)),

    // Interference: Increases from 0% -> 35% (Power Curve for late-game ramp)
    interference: Math.round(35 * Math.pow(progress, 2)),

    // Trial Time: Speeds up from 2500ms -> 1500ms (Linear)
    trialTime: Math.round(2500 - (1000 * progress))
  };
};
export const runAutoProgression = async (gameInfo, scoresheet) => {
  const $settings = get(settings);

  // 1. Safety Checks
  if (!$settings.enableAutoProgression) return;

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
  const dPrime = calculateDPrime(hits, misses, fas, nonTargets);
  // Helper for the logs
  const logDPrime = (label, hits, misses, fas, nonTargets) => {
    const dp = calculateDPrime(hits, misses, fas, nonTargets);
    const hitRate = ((hits / (hits + misses)) * 100).toFixed(1);
    const faRate = ((fas / nonTargets) * 100).toFixed(1);

    console.log(`--- ${label} ---`);
    console.log(`Hit Rate: ${hitRate}% | FA Rate: ${faRate}%`);
    console.log(`Resulting d': ${dp.toFixed(3)}`);

    if (dp > 2.5) console.log("Status: 🚀 MASTERING (Fast Progress)");
    else if (dp > 1.5) console.log("Status: ✅ STEADY (Small Progress)");
    else if (dp >= 1.0) console.log("Status: 📈 EDGE (Maintenance/Hovering)");
    else console.log("Status: ⚠️ STRUGGLING (Penalty)");
    console.log("\n");
  };

  // Assuming a standard session of 40 trials: 10 matches, 30 non-matches
  const T = 10;  // Total Targets
  const N = 30;  // Total Non-Targets

  console.log("%c D-PRIME PERFORMANCE BENCHMARKS", "color: #00ff00; font-weight: bold; font-size: 14px;");

  // 1. Perfect Performance
  logDPrime("Last Session", hits, misses, fas, totalNonTargets);
  let currentP = gameInfo.levelProgress || 0;


  // 5. Update Progress based on Performance
  // Optimized "Edge of Performance" Progression
  if (dPrime >= 2.75) {
    // Mastery: They are crushing it. Jump ahead.
    currentP += 0.08;
  } else if (dPrime >= 2.0) {
    // Edge: This is the sweet spot. Moderate progress.
    currentP += 0.04;
  } else if (dPrime >= 1.5) {
    // Maintenance: They are hanging on. Slow progress.
    currentP += 0.01;
  } else if (dPrime >= 1.0) {
    // Buffer Zone: No progress, but no penalty. 
    // They are at their limit but not failing.
    currentP += 0;
  } else if (dPrime < 1.0 && dPrime >= 0.5) {
    // Slight Struggle: Gentle nudge back.
    currentP -= 0.02;
  } else {
    // Failure/Guessing: Clear step back to regain confidence.
    currentP -= 0.06;
  }
  // Note: We allow it to hit 1.0, but the "Level Up" trigger is 0.8
  currentP = Math.max(0, Math.min(1.0, currentP));

  // 6. Check for Level Up (The 80% Bridge)
  // If progress >= 0.8, they have mastered the difficult version of this N-back
  if (currentP >= 0.90) {
    const nextN = Math.min(gameInfo.nBack + 1, 12);

    // Only level up if we aren't already at max
    if (nextN > gameInfo.nBack) {
      gameSettings.setField('nBack', nextN);
      currentP = 0; // Reset progress for the new level

      // Mark this transition in history (Tombstone)
      await addGame({ ...gameInfo, status: 'tombstone', result: 'level-up' });
      autoProgression.advance(); // UI Notification
    }
  }
  // Optional: Level Down (Fallback) if they are failing hard at P=0
  else if (currentP === 0 && dPrime < 0.5) {
    // Use your existing failure combo logic here if you want, 
    // or just drop them immediately if d' is catastrophic.
    const prevN = Math.max(gameInfo.nBack - 1, 1);
    if (prevN < gameInfo.nBack) {
      gameSettings.setField('nBack', prevN);
      currentP = 0.5; // Start them halfway through the previous level
      await addGame({ ...gameInfo, status: 'tombstone', result: 'level-down' });
      autoProgression.fallback();
    }
  }

  // 7. Apply New Parameters for the NEXT Game
  const newParams = getDifficultyParams(currentP);

  gameSettings.setField('matchChance', newParams.matchChance);
  gameSettings.setField('interference', newParams.interference);
  gameSettings.setField('trialTime', newParams.trialTime);
  gameSettings.setField('levelProgress', Number(currentP.toFixed(2)))
}



