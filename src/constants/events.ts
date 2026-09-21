import { ImageSourcePropType } from 'react-native';

export type Gradient = [string, string];

export interface EventData {
  title: string;
  subtitle: string;
  tag: string;
  tagIcon?: string; // Feather icon in the badge (default: bell)
  emoji: string;
  gradient: Gradient;
  meta?: string;
  metaIcon?: string; // Feather icon before meta (default: clock)
  image?: ImageSourcePropType;
}

export interface Upcoming {
  title: string;
  emoji: string;
  days: number;
}

export const G = {
  purple: ['#33196F', '#6D42C7'] as Gradient,
  saffron: ['#C2410C', '#F59F00'] as Gradient,
  green: ['#0B5D45', '#2FAF7F'] as Gradient,
  navy: ['#10295E', '#2F6FDB'] as Gradient,
  rose: ['#8F1446', '#E64980'] as Gradient,
  teal: ['#0A5B66', '#22A6BD'] as Gradient,
  gold: ['#7A4B00', '#C98A00'] as Gradient,
  crimson: ['#7F1717', '#DB4437'] as Gradient,
  indigo: ['#26246B', '#5C5BD6'] as Gradient,
};


export const FIXED_EVENTS: Record<string, EventData> = {
  '1-1': { title: 'Happy New Year', subtitle: 'A fresh start for every learner', tag: 'Celebration', emoji: '🎆', gradient: G.navy },
  '1-12': { title: 'National Youth Day', subtitle: "Swami Vivekananda's birthday", tag: 'Inspiration', emoji: '🌟', gradient: G.saffron },
  '1-14': { title: 'Makar Sankranti', subtitle: 'Kites, sweets and sunshine', tag: 'Festival', emoji: '🪁', gradient: G.saffron },
  '1-23': { title: 'Netaji Jayanti', subtitle: 'Remembering Subhas Chandra Bose', tag: 'Remembrance', emoji: '🇮🇳', gradient: G.navy },
  '1-26': { title: 'Republic Day', subtitle: 'Flag Hoisting @ 8:30 AM', tag: 'National Holiday', emoji: '🇮🇳', gradient: G.green, meta: '8:30 AM, School Ground' },
  '1-30': { title: "Martyrs' Day", subtitle: 'Two minutes of silence at 11:00 AM', tag: 'Remembrance', emoji: '🕊️', gradient: G.indigo },
  '2-21': { title: 'Mother Language Day', subtitle: 'Celebrate the languages we speak', tag: 'Awareness', emoji: '🗣️', gradient: G.teal },
  '2-28': { title: 'National Science Day', subtitle: 'Stay curious, keep experimenting', tag: 'Celebration', emoji: '🔬', gradient: G.teal },
  '3-8': { title: "Women's Day", subtitle: 'Celebrating the women who shape our school', tag: 'Celebration', emoji: '🌸', gradient: G.rose },
  '3-14': { title: 'Pi Day', subtitle: '3.14159… the magic of numbers', tag: 'Fun Day', emoji: '🥧', gradient: G.purple },
  '3-22': { title: 'World Water Day', subtitle: 'Every drop counts', tag: 'Awareness', emoji: '💧', gradient: G.navy },
  '4-7': { title: 'World Health Day', subtitle: 'Healthy students learn better', tag: 'Awareness', emoji: '🩺', gradient: G.teal },
  '4-14': { title: 'Ambedkar Jayanti', subtitle: 'Architect of the Indian Constitution', tag: 'Remembrance', emoji: '📘', gradient: G.navy },
  '4-22': { title: 'Earth Day', subtitle: 'Our planet, our responsibility', tag: 'Awareness', emoji: '🌍', gradient: G.green },
  '4-23': { title: 'World Book Day', subtitle: 'Pick a book, get lost in a story', tag: 'Celebration', emoji: '📚', gradient: G.purple },
  '5-1': { title: 'Labour Day', subtitle: 'Honouring hard work everywhere', tag: 'Holiday', emoji: '🛠️', gradient: G.crimson },
  '5-11': { title: 'National Technology Day', subtitle: "India's science and tech milestones", tag: 'Celebration', emoji: '💡', gradient: G.indigo },
  '6-5': { title: 'World Environment Day', subtitle: 'Plant a tree today', tag: 'Awareness', emoji: '🌳', gradient: G.green },
  '6-21': { title: 'International Yoga Day', subtitle: 'Mind, body and breath', tag: 'Wellness', emoji: '🧘', gradient: G.teal },
  '7-1': { title: "National Doctors' Day", subtitle: 'Thank the people who heal', tag: 'Celebration', emoji: '⚕️', gradient: G.teal },
  '8-12': { title: 'International Youth Day', subtitle: 'Young voices, big ideas', tag: 'Celebration', emoji: '🙌', gradient: G.saffron },
  '8-15': { title: 'Independence Day', subtitle: 'Flag Hoisting @ 8:00 AM', tag: 'National Holiday', emoji: '🇮🇳', gradient: G.saffron, meta: '8:00 AM, School Ground' },
  '8-29': { title: 'National Sports Day', subtitle: "Major Dhyan Chand's birthday", tag: 'Celebration', emoji: '🏅', gradient: G.green },
  '9-5': { title: "Teachers' Day", subtitle: 'Honoring our educators', tag: 'Celebration', emoji: '🎓', gradient: G.purple },
  '9-8': { title: 'International Literacy Day', subtitle: 'Reading opens every door', tag: 'Awareness', emoji: '📖', gradient: G.indigo },
  '9-14': { title: 'Hindi Diwas', subtitle: 'Celebrating the language of the heart', tag: 'Celebration', emoji: '🖋️', gradient: G.saffron },
  '9-15': { title: "Engineers' Day", subtitle: 'Remembering Sir M. Visvesvaraya', tag: 'Celebration', emoji: '⚙️', gradient: G.navy },
  '9-21': { title: 'Intl. Day of Peace', subtitle: 'Special Assembly @ 10:00 AM', tag: 'Awareness', emoji: '☮️', gradient: G.teal, meta: '10:00 AM, Assembly Hall' },
  '10-2': { title: 'Mahatma Gandhi Jayanti', subtitle: 'National Holiday', tag: 'Celebration', emoji: '🕊️', gradient: G.purple, meta: '10:30 AM, Morning Hall' },
  '10-5': { title: "World Teachers' Day", subtitle: 'A thank-you note goes a long way', tag: 'Celebration', emoji: '🍎', gradient: G.rose },
  '10-15': { title: "World Students' Day", subtitle: "Dr. A.P.J. Abdul Kalam's birthday", tag: 'Inspiration', emoji: '🚀', gradient: G.indigo },
  '10-31': { title: 'National Unity Day', subtitle: "Sardar Vallabhbhai Patel's birthday", tag: 'Celebration', emoji: '🤝', gradient: G.saffron },
  '11-14': { title: "Children's Day", subtitle: "Pandit Nehru's birthday", tag: 'Celebration', emoji: '🎈', gradient: G.rose },
  '11-26': { title: 'Constitution Day', subtitle: 'Know your rights and duties', tag: 'Awareness', emoji: '📜', gradient: G.navy },
  '12-10': { title: 'Human Rights Day', subtitle: 'Equal dignity for everyone', tag: 'Awareness', emoji: '⚖️', gradient: G.indigo },
  '12-22': { title: 'National Mathematics Day', subtitle: "Srinivasa Ramanujan's birthday", tag: 'Celebration', emoji: '➗', gradient: G.purple },
  '12-25': { title: 'Christmas', subtitle: 'Winter Vacation Begins', tag: 'Festival', emoji: '🎄', gradient: G.crimson },
};

/**
 * Festivals whose date shifts every year (lunar calendar etc.).
 * Key = 'YYYY-M-D'. Update this per-year — there's no reliable free
 * API for Indian festival dates either, so this is the one place to
 * maintain them season to season.
 */
export const MOVABLE_EVENTS: Record<string, EventData> = {
  '2026-3-4': { title: 'Happy Holi', subtitle: 'Festival of colours', tag: 'Festival', emoji: '🎨', gradient: G.rose },
  '2026-8-28': { title: 'Raksha Bandhan', subtitle: 'Celebrating the bond of siblings', tag: 'Festival', emoji: '🪢', gradient: G.saffron },
  '2026-9-4': { title: 'Janmashtami', subtitle: "Celebrating Lord Krishna's birth", tag: 'Festival', emoji: '🦚', gradient: G.indigo },
  '2026-9-14': { title: 'Ganesh Chaturthi', subtitle: 'Ganpati Bappa Morya!', tag: 'Festival', emoji: '🐘', gradient: G.saffron },
  '2026-10-20': { title: 'Dussehra', subtitle: 'Victory of good over evil', tag: 'Festival', emoji: '🏹', gradient: G.crimson },
  '2026-11-8': { title: 'Happy Diwali', subtitle: 'Festival of lights', tag: 'Festival', emoji: '🪔', gradient: G.gold },
};

export const DAILY_THEMES: Record<number, { title: string; emoji: string; gradient: Gradient }> = {
  0: { title: 'Sunday Reset', emoji: '🌿', gradient: G.teal },
  1: { title: 'Motivation Monday', emoji: '🚀', gradient: G.purple },
  2: { title: 'Tuesday Focus', emoji: '🎯', gradient: G.navy },
  3: { title: 'Wisdom Wednesday', emoji: '🦉', gradient: G.indigo },
  4: { title: 'Thursday Thinking', emoji: '💡', gradient: G.gold },
  5: { title: 'Friday Cheer', emoji: '🌈', gradient: G.rose },
  6: { title: 'Saturday Spark', emoji: '✨', gradient: G.saffron },
};

export const QUOTES: { text: string; by: string }[] = [
  { text: 'Dream, dream, dream. Dreams transform into thoughts and thoughts result in action.', by: 'A.P.J. Abdul Kalam' },
  { text: 'Education is the most powerful weapon which you can use to change the world.', by: 'Nelson Mandela' },
  { text: 'The future depends on what you do today.', by: 'Mahatma Gandhi' },
  { text: 'Arise, awake and stop not till the goal is reached.', by: 'Swami Vivekananda' },
  { text: 'Success is the sum of small efforts, repeated day in and day out.', by: 'Robert Collier' },
  { text: 'The beautiful thing about learning is that no one can take it away from you.', by: 'B.B. King' },
  { text: "It always seems impossible until it's done.", by: 'Nelson Mandela' },
  { text: "Believe you can and you're halfway there.", by: 'Theodore Roosevelt' },
  { text: 'Small deeds done are better than great deeds planned.', by: 'Peter Marshall' },
  { text: 'Learning never exhausts the mind.', by: 'Leonardo da Vinci' },
  { text: "Don't watch the clock; do what it does. Keep going.", by: 'Sam Levenson' },
  { text: 'A journey of a thousand miles begins with a single step.', by: 'Lao Tzu' },
  { text: 'Excellence is not an act, but a habit.', by: 'Will Durant' },
  { text: 'Where there is a will, there is a way.', by: 'Proverb' },
];

export const dayOfYear = (d: Date) =>
  Math.floor(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) /
      86400000
  );

export const getScheduledEvent = (d: Date): EventData | null => {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return MOVABLE_EVENTS[`${d.getFullYear()}-${m}-${day}`] || FIXED_EVENTS[`${m}-${day}`] || null;
};

export const getThoughtOfTheDay = (d: Date): EventData => {
  const theme = DAILY_THEMES[d.getDay()];
  const quote = QUOTES[dayOfYear(d) % QUOTES.length];
  return {
    title: theme.title,
    subtitle: `“${quote.text}”`,
    tag: 'Thought of the Day',
    tagIcon: 'sun',
    emoji: theme.emoji,
    gradient: theme.gradient,
    meta: quote.by,
    metaIcon: 'feather',
  };
};

export const getHeroForDate = (d: Date): EventData => getScheduledEvent(d) || getThoughtOfTheDay(d);

export const getUpcoming = (from: Date): Upcoming | null => {
  for (let i = 1; i <= 60; i++) {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const ev = getScheduledEvent(d);
    if (ev) return { title: ev.title, emoji: ev.emoji, days: i };
  }
  return null;
};

export const getGreeting = (hour: number) => {
  if (hour < 12) return { text: 'Good Morning', emoji: '☀️' };
  if (hour < 17) return { text: 'Good Afternoon', emoji: '🌤️' };
  if (hour < 20) return { text: 'Good Evening', emoji: '🌇' };
  return { text: 'Good Night', emoji: '🌙' };
};