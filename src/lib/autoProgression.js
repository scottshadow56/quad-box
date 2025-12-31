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
  let totalTrials = 0;

  // Iterate over every trial in the scoresheet
  scoresheet.forEach(trial => {
    if (!trial) return;
    Object.values(trial).forEach(status => {
      totalTrials++; // Count every stimuli interaction opportunity
      if (status === 'hit') hits++;
      else if (status === 'miss') misses++;
      else if (status === 'lure-fa' || status === 'random-fa') fas++;
    });
  });
  console.log(hits, misses, fas)
  const totalTargets = hits + misses;
  const totalNonTargets = totalTrials - totalTargets;

  // 3. Calculate d' (Sensitivity)
  const dPrime = calculateDPrime(hits, misses, fas, totalNonTargets);

  // 4. Retrieve Current Progress (Default to 0 if new)
  // We assume 'levelProgress' is stored in settings. If not, we default to 0.
  let currentP = gameInfo.levelProgress || 0;

  console.log(gameInfo)

  // 5. Update Progress based on Performance
  // Thresholds: > 2.5 is "Flow State", < 1.0 is "Struggling"
  if (dPrime >= 1.2) {
    currentP += 0.05; // 5% progression boost
  } else if (dPrime >= 0.8) {
    currentP += 0.02; // Small boost for solid performance
  } else if (dPrime < 0) {
    currentP -= 0.02; // Small penalty for confusion
  } else if (dPrime < -0.8) {
    currentP -= 0.05; // Larger penalty for guessing/random clicking
  }
  console.log(dPrime)
  // Clamp progress to keep it sane (0.0 to 1.0)
  // Note: We allow it to hit 1.0, but the "Level Up" trigger is 0.8
  currentP = Math.max(0, Math.min(1.0, currentP));

  // 6. Check for Level Up (The 80% Bridge)
  // If progress >= 0.8, they have mastered the difficult version of this N-back
  if (currentP >= 0.80) {
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



