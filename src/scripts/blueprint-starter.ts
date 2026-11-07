export function starterBlueprint(goal: string) {
  if (/\b(sleep\w*|bedtime|insomnia|rest|rested|wind[- ]down)\b/i.test(goal)) {
    return {
      identity: 'I am someone who makes time to wind down.',
      question: 'What can I do in the next 60 seconds to make bedtime easier?',
      minimum: 'Put my phone on its charger away from the bed.',
      whyItsHard: 'One more scroll or unfinished task can push bedtime later.',
      conduct: 'Pick a wind-down cue and make the next step easy to see.',
      ordinaryDay: 'When my wind-down cue comes up, I put the phone away and dim the lights.',
      tradeoffs: 'I leave some low-priority tasks for tomorrow.',
      slipResponse: 'If I miss my cue, I do the smallest wind-down step I can and try again tomorrow.',
      signsItsWorking: 'For seven days, mark whether I started winding down when I intended.',
    };
  }
  return {
    identity: 'I am someone who takes one small step toward what matters.',
    question: 'What can I do in 60 seconds to make progress on this goal?',
    minimum: 'Write down one action I can finish in 60 seconds, then do it.',
    whyItsHard: 'A broad goal can be hard to act on when the next step is unclear.',
    conduct: 'Choose one action that is small enough to repeat on an ordinary day.',
    ordinaryDay: 'After a routine I already have, I take the action and mark it done.',
    tradeoffs: 'I set aside a minute for the action and leave bigger changes for later.',
    slipResponse: 'If I miss a day, I shrink the action and return at the next cue.',
    signsItsWorking: 'For seven days, mark whether I took the action and what made it easier.',
  };
}
