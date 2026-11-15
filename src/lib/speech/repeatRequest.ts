const LEAD_WORDS = [
  'sorry',
  'please',
  'hey',
  'um',
  'uh',
  'oh',
  'ok',
  'okay',
  'can you',
  'could you',
  'would you',
  'will you',
];

const REPEAT_ASKS = new Set([
  'repeat',
  'repeat that',
  'repeat it',
  'repeat the last thing',
  'repeat what you said',
  'say that again',
  'say it again',
  'say again',
  'say that one more time',
  'say it one more time',
  'tell me again',
  'tell me that again',
  'read that again',
  'read it again',
  'play that again',
  'play it again',
  'one more time',
  'once more',
  'come again',
  'again',
  'what',
  'what was that',
  'what did you say',
  'what was it you said',
  'what did you just say',
  'huh',
  'pardon',
  'pardon me',
  'excuse me',
  "i didn't catch that",
  "i didn't get that",
  "i didn't hear that",
  "i didn't hear you",
  "didn't catch that",
  "didn't get that",
  "didn't hear that",
  'i missed that',
  'i missed what you said',
  'missed that',
]);

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.,!?;:…]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const stripLeads = (said: string): string => {
  const lead = LEAD_WORDS.find((word) => said.startsWith(`${word} `));
  return lead ? stripLeads(said.slice(lead.length).trim()) : said;
};

/** Whether the whole utterance only asks to hear the last line again ("sorry, say that again"); a sentence that merely contains such words is not one. */
export const isRepeatRequest = (text: string) => {
  const heard = normalize(text);
  const said = stripLeads(heard.replace(/ please$/, ''));
  return (
    (said !== '' && REPEAT_ASKS.has(said)) ||
    (heard === 'sorry' && text.trim().endsWith('?'))
  );
};
