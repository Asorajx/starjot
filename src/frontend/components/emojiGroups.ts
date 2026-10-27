/* =========================
   Emoji Groups
   ========================= */

/* The emoji offered in the icon picker, grouped into tabs. They are ordinary Unicode emoji, */
/* drawn with the app's Twemoji font (see styles.css), so they look the same on every system. */
export type EmojiGroup = {
  name: string;
  emoji: string[];
};

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: 'Smileys',
    emoji: ['😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😎', '🤓', '🧐', '🤔', '😴', '😌', '😅', '😂', '🥳', '😇', '🤩', '😮', '😢', '😤', '🙃']
  },
  {
    name: 'People',
    emoji: ['👋', '👍', '👏', '🙌', '🤝', '✌️', '💪', '🧠', '👀', '🫶', '🙏', '✍️', '🧑‍💻', '🧑‍🎓', '🧑‍🏫', '🧑‍🔬', '🧑‍🎨', '🧑‍🍳', '👨‍👩‍👧', '🏃', '🧘', '💃', '🚶', '🛌']
  },
  {
    name: 'Nature',
    emoji: ['🌱', '🌿', '🍀', '🌳', '🌲', '🌵', '🌸', '🌻', '🌼', '🍁', '🍂', '🌊', '🔥', '⭐', '🌙', '☀️', '⛅', '🌈', '❄️', '⚡', '🐱', '🐶', '🦊', '🐢']
  },
  {
    name: 'Food',
    emoji: ['🍎', '🍋', '🍓', '🍇', '🍑', '🥑', '🥕', '🌽', '🍞', '🧀', '🍳', '🍕', '🍔', '🍜', '🍣', '🍱', '🍰', '🍪', '🍫', '☕', '🍵', '🧋', '🥤', '🍷']
  },
  {
    name: 'Activities',
    emoji: ['⚽', '🏀', '🎾', '🏸', '🏓', '🏊', '🚴', '🎯', '🎮', '🎲', '🧩', '🎨', '🎬', '🎤', '🎧', '🎵', '🎸', '🎹', '📷', '🏆', '🥇', '🎉', '🎁', '🎈']
  },
  {
    name: 'Travel',
    emoji: ['🏠', '🏡', '🏢', '🏫', '🏥', '🏖️', '🏔️', '🗺️', '🧭', '🚗', '🚌', '🚆', '✈️', '🚀', '🛸', '⛵', '🚲', '🗽', '🗼', '🏰', '⛺', '🌍', '🌏', '🏝️']
  },
  {
    name: 'Objects',
    emoji: ['📝', '📒', '📓', '📔', '📚', '📖', '🗂️', '📁', '📌', '📎', '✏️', '🖊️', '🖋️', '💡', '🔍', '🔑', '🗝️', '💼', '💻', '🖥️', '📱', '⏰', '📅', '🗓️']
  },
  {
    name: 'Symbols',
    emoji: ['✅', '☑️', '❌', '❗', '❓', '💯', '⭐', '✨', '💫', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪']
  }
];

/* Words each emoji can be found by when searching the picker (its usual name, then a few more). */
export const EMOJI_NAMES: Record<string, string> = {
  '😀': 'grinning face smile happy', '😃': 'smiley big eyes smile happy', '😄': 'smile grin happy eyes', '😁': 'beaming grin teeth happy',
  '😊': 'blush smiling eyes happy', '🙂': 'slight smile', '😉': 'wink', '😍': 'heart eyes love',
  '🥰': 'smiling hearts love', '😎': 'sunglasses cool', '🤓': 'nerd glasses', '🧐': 'monocle curious',
  '🤔': 'thinking hmm', '😴': 'sleeping zzz tired', '😌': 'relieved calm', '😅': 'sweat smile nervous',
  '😂': 'tears of joy laugh lol', '🥳': 'party celebrate', '😇': 'halo angel innocent', '🤩': 'star struck excited',
  '😮': 'open mouth surprised wow', '😢': 'crying sad tear', '😤': 'triumph huff angry', '🙃': 'upside down silly',
  '👋': 'wave hello hi bye', '👍': 'thumbs up like yes ok', '👏': 'clap applause', '🙌': 'raising hands hooray',
  '🤝': 'handshake deal agree', '✌️': 'victory peace', '💪': 'flexed biceps strong muscle', '🧠': 'brain smart think',
  '👀': 'eyes look see', '🫶': 'heart hands love', '🙏': 'folded hands please thanks pray', '✍️': 'writing hand write',
  '🧑‍💻': 'technologist coder developer computer', '🧑‍🎓': 'student graduate school', '🧑‍🏫': 'teacher class', '🧑‍🔬': 'scientist lab research',
  '🧑‍🎨': 'artist paint art', '🧑‍🍳': 'cook chef kitchen', '👨‍👩‍👧': 'family people', '🏃': 'running run exercise',
  '🧘': 'yoga meditate calm', '💃': 'dancing dance', '🚶': 'walking walk', '🛌': 'bed sleep rest',
  '🌱': 'seedling sprout plant grow', '🌿': 'herb leaf plant', '🍀': 'four leaf clover luck', '🌳': 'deciduous tree',
  '🌲': 'evergreen tree pine', '🌵': 'cactus desert', '🌸': 'cherry blossom flower', '🌻': 'sunflower flower',
  '🌼': 'blossom flower daisy', '🍁': 'maple leaf autumn fall', '🍂': 'fallen leaves autumn fall', '🌊': 'wave ocean sea water',
  '🔥': 'fire hot flame', '⭐': 'star favourite favorite', '🌙': 'crescent moon night', '☀️': 'sun sunny day weather',
  '⛅': 'sun behind cloud weather', '🌈': 'rainbow', '❄️': 'snowflake snow cold winter', '⚡': 'lightning zap energy',
  '🐱': 'cat face kitten pet', '🐶': 'dog face puppy pet', '🦊': 'fox', '🐢': 'turtle slow',
  '🍎': 'red apple fruit', '🍋': 'lemon fruit', '🍓': 'strawberry fruit', '🍇': 'grapes fruit',
  '🍑': 'peach fruit', '🥑': 'avocado', '🥕': 'carrot vegetable', '🌽': 'corn vegetable',
  '🍞': 'bread', '🧀': 'cheese', '🍳': 'cooking egg breakfast', '🍕': 'pizza',
  '🍔': 'hamburger burger', '🍜': 'noodles ramen soup', '🍣': 'sushi', '🍱': 'bento box lunch',
  '🍰': 'cake shortcake dessert', '🍪': 'cookie', '🍫': 'chocolate', '☕': 'coffee hot drink',
  '🍵': 'tea cup drink', '🧋': 'bubble tea boba drink', '🥤': 'cup straw drink soda', '🍷': 'wine glass drink',
  '⚽': 'soccer football ball sport', '🏀': 'basketball ball sport', '🎾': 'tennis ball sport', '🏸': 'badminton sport',
  '🏓': 'ping pong table tennis sport', '🏊': 'swimming swim sport', '🚴': 'cycling bike sport', '🎯': 'target goal bullseye',
  '🎮': 'video game controller gaming', '🎲': 'dice game', '🧩': 'puzzle piece', '🎨': 'palette art paint',
  '🎬': 'clapper film movie', '🎤': 'microphone sing', '🎧': 'headphones music', '🎵': 'music note',
  '🎸': 'guitar music', '🎹': 'piano keyboard music', '📷': 'camera photo', '🏆': 'trophy win award',
  '🥇': 'first place gold medal', '🎉': 'party popper celebrate tada', '🎁': 'gift present', '🎈': 'balloon party',
  '🏠': 'house home', '🏡': 'house garden home', '🏢': 'office building work', '🏫': 'school',
  '🏥': 'hospital health', '🏖️': 'beach umbrella holiday', '🏔️': 'mountain snow', '🗺️': 'world map',
  '🧭': 'compass direction', '🚗': 'car automobile drive', '🚌': 'bus', '🚆': 'train',
  '✈️': 'airplane plane flight travel', '🚀': 'rocket launch', '🛸': 'flying saucer ufo', '⛵': 'sailboat boat',
  '🚲': 'bicycle bike', '🗽': 'statue of liberty', '🗼': 'tokyo tower', '🏰': 'castle',
  '⛺': 'tent camping', '🌍': 'globe europe africa world earth', '🌏': 'globe asia australia world earth', '🏝️': 'desert island holiday',
  '📝': 'memo note write', '📒': 'ledger notebook', '📓': 'notebook', '📔': 'notebook decorative cover journal',
  '📚': 'books library read', '📖': 'open book read', '🗂️': 'card index dividers organise organize', '📁': 'file folder',
  '📌': 'pushpin pin', '📎': 'paperclip attach', '✏️': 'pencil write', '🖊️': 'pen write',
  '🖋️': 'fountain pen write', '💡': 'light bulb idea', '🔍': 'magnifying glass search find', '🔑': 'key password',
  '🗝️': 'old key', '💼': 'briefcase work business', '💻': 'laptop computer', '🖥️': 'desktop computer screen',
  '📱': 'mobile phone', '⏰': 'alarm clock time', '📅': 'calendar date', '🗓️': 'spiral calendar planner',
  '✅': 'check mark done tick yes', '☑️': 'check box ballot done', '❌': 'cross mark no wrong', '❗': 'exclamation important',
  '❓': 'question mark help', '💯': 'hundred points perfect', '✨': 'sparkles shine new', '💫': 'dizzy star',
  '❤️': 'red heart love', '🧡': 'orange heart love', '💛': 'yellow heart love', '💚': 'green heart love',
  '💙': 'blue heart love', '💜': 'purple heart love', '🖤': 'black heart', '🔴': 'red circle',
  '🟠': 'orange circle', '🟡': 'yellow circle', '🟢': 'green circle', '🔵': 'blue circle',
  '🟣': 'purple circle', '⚫': 'black circle', '⚪': 'white circle'
};

/* The picker's emoji whose words start with every word typed (in any order), in the picker's order. */
export function searchEmoji(query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = [...new Set(EMOJI_GROUPS.flatMap(group => group.emoji))];
  return all.filter(emoji => {
    const names = (EMOJI_NAMES[emoji] ?? '').split(' ');
    return words.every(word => names.some(name => name.startsWith(word)));
  });
}
