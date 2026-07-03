"use client";

import { motion } from "framer-motion";

function scoreColor(score: number): string {
  if (score >= 70) return "var(--color-favorable)";
  if (score >= 40) return "var(--color-vigilance)";
  return "var(--color-alerte)";
}

export function ScoreGauge({ score, explanation }: { score: number; explanation: string }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-primary-100 bg-surface p-6 shadow-sm sm:flex-row sm:items-start sm:gap-6">
      <div
        className="relative h-32 w-32 shrink-0"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Score global du logement"
      >
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="var(--color-primary-100)"
            strokeWidth="10"
          />
          <motion.circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold text-ink">{score}</span>
          <span className="text-xs text-ink-muted">/ 100</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-ink">Score global pondéré</h2>
        <p className="mt-1 text-sm text-ink-muted">{explanation}</p>
      </div>
    </div>
  );
}
