import { EVENT_PODIUM_BONUS, payout } from "@playloop/economy";

export interface EventRound {
  number: number;
  title: string;
  arabicTitle: string;
  gameType: "tap" | "reflex" | "catch";
  durationSeconds: number;
  targetScore: number;
  maxPoints: number;
}

export interface VenueEventConfig {
  code: string;
  title: string;
  arabicTitle: string;
  venueName: string;
  location: string;
  sponsorName: string;
  sponsorTagline: string;
  accentColor: string;
  rounds: EventRound[];
}

export interface CrowdPlayer {
  id: string;
  name: string;
  avatarIndex: number;
  skill: number;
  score: number;
  totalScore: number;
  isMe?: boolean;
}

export const VENUE_EVENTS: Record<string, VenueEventConfig> = {
  "OASIS-LIVE": {
    code: "OASIS-LIVE",
    title: "Oasis Mall National Day Live",
    arabicTitle: "أمسية اليوم الوطني في أوايسس مول",
    venueName: "Oasis Mall Arena",
    location: "Central Atrium LED Wall, Ground Floor",
    sponsorName: "Beanhouse Specialty Coffee",
    sponsorTagline: "Presented by Beanhouse",
    accentColor: "#FFDD3C",
    rounds: [
      {
        number: 1,
        title: "Speed Bean Rush",
        arabicTitle: "سباق حبات القهوة السريع",
        gameType: "tap",
        durationSeconds: 30,
        targetScore: 240,
        maxPoints: 300,
      },
      {
        number: 2,
        title: "National Day Reflex",
        arabicTitle: "تحدي سرعة البديهة لليوم الوطني",
        gameType: "reflex",
        durationSeconds: 30,
        targetScore: 280,
        maxPoints: 400,
      },
    ],
  },
  "DUBAI-LIVE": {
    code: "DUBAI-LIVE",
    title: "Dubai Mall Ice Rink Showdown",
    arabicTitle: "تحدي شاشة حلبة التزلج بدبي مول",
    venueName: "Dubai Mall Mega LED Arena",
    location: "Ice Rink Giant Screen, Level G",
    sponsorName: "Level Shoes",
    sponsorTagline: "Presented by Level Shoes",
    accentColor: "#3FC8FF",
    rounds: [
      {
        number: 1,
        title: "Speed Run Sprint",
        arabicTitle: "سباق الجري السريع",
        gameType: "tap",
        durationSeconds: 30,
        targetScore: 250,
        maxPoints: 350,
      },
      {
        number: 2,
        title: "Sneaker Drop Reflex",
        arabicTitle: "التقاط الأحذية الرياضية",
        gameType: "reflex",
        durationSeconds: 30,
        targetScore: 300,
        maxPoints: 450,
      },
    ],
  },
  "GLOW-LIVE": {
    code: "GLOW-LIVE",
    title: "Glow Arcade Championship",
    arabicTitle: "بطولة غلو آركيد الكبرى",
    venueName: "Glow Arcade Arena",
    location: "Main Stage Esports LED, City Centre Deira",
    sponsorName: "VOX Cinemas & Magic Planet",
    sponsorTagline: "Presented by VOX Cinemas",
    accentColor: "#FF5FA2",
    rounds: [
      {
        number: 1,
        title: "Neon Pulse Tap",
        arabicTitle: "نبض النيون السريع",
        gameType: "tap",
        durationSeconds: 30,
        targetScore: 260,
        maxPoints: 350,
      },
    ],
  },
};

const CROWD_NAMES = [
  "Aisha", "Omar", "Priya", "Jun", "Layla", "Khalid", "Sara", "Ravi",
  "Mia", "Yousef", "Dana", "Hamdan", "Zara", "Fatima", "Ahmed", "Maryam",
  "Arjun", "Chloe", "Rashid", "Noor", "Joy", "Marco", "Hessa", "Salem",
  "Ana", "Tariq", "Leila", "Kiara", "Sultan", "Reem", "Mateo", "Amal",
  "Vikram", "Grace", "Saeed", "Lina"
];

const INITIALS = "ABCDEFGHJKLMNPRSTWZ";

export function generateSimulatedPlayer(index: number): CrowdPlayer {
  const name = `${CROWD_NAMES[index % CROWD_NAMES.length]} ${INITIALS[(index * 7) % INITIALS.length]}.`;
  const avatarIndex = (index * 3) % 6;
  // Skill distribution centered around 0.85 with natural variation
  const skill = 0.5 + ((index * 17) % 70) / 100;
  return {
    id: `sim_${index}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    avatarIndex,
    skill,
    score: 0,
    totalScore: 0,
    isMe: false,
  };
}

export function calculateRoundPayout(round: EventRound, score: number, rank: number): number {
  const base = payout(round.maxPoints, score, round.targetScore);
  const podiumBonus = EVENT_PODIUM_BONUS[rank - 1] ?? 0;
  return base + podiumBonus;
}
