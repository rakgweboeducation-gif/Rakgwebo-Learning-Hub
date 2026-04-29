import { db } from "./db";
import { textbooks, atp_topics, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function seedDatabase() {
  try {
    const existingAdmins = await db
      .select()
      .from(users)
      .where(eq(users.role, "admin"));

    if (existingAdmins.length === 0) {
      const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD || "Admin@2025!";
      console.log("[Seed] Creating default admin account...");

      const hashedPassword = await hashPassword(adminPassword);

      await db.insert(users).values({
        username: "admin",
        password: hashedPassword,
        role: "admin",
        name: "Admin",
        surname: "User",
        email: null,
        avatar: null,
        bio: null,
        grade: null,
        isTutorApproved: true,
      });

      console.log("[Seed] Default admin account created.");
    }

    const existingTextbooks = await db.select().from(textbooks);

    if (existingTextbooks.length === 0) {
      console.log("[Seed] Seeding textbooks...");

      await db.insert(textbooks).values([
        {
          title: "Rakgwebo Maths Grade 10",
          grade: 10,
          url: "/textbooks/grade-10.pdf",
          coverUrl: "/images/grade-10-cover.jpg",
        },
        {
          title: "Rakgwebo Maths Grade 11",
          grade: 11,
          url: "/textbooks/grade-11.pdf",
          coverUrl: "/images/grade-11-cover.png",
        },
        {
          title: "Rakgwebo Maths Grade 12",
          grade: 12,
          url: "/textbooks/grade-12.pdf",
          coverUrl: "/images/grade-12-cover.png",
        },
      ]);

      console.log("[Seed] Textbooks seeded successfully");
    }

    await seedAllATPTopics();
  } catch (err) {
    console.error("[Seed] Error seeding database:", err);
  }
}

async function seedAllATPTopics() {
  const existingTopics = await db.select().from(atp_topics);

  const mathTopics = existingTopics.filter((t) => t.subject === "Mathematics");
  const otherTopics = existingTopics.filter((t) => t.subject !== "Mathematics");

  if (mathTopics.length === 0) {
    console.log("[Seed] Seeding Mathematics ATP topics...");
    await seedFromFile("atp-data.json", "Mathematics");
  }

  if (otherTopics.length === 0) {
    const subjectsFile = join(
      process.cwd(),
      "server",
      "atp-subjects-data.json",
    );

    if (existsSync(subjectsFile)) {
      console.log("[Seed] Seeding multi-subject ATP topics...");
      await seedFromFile("atp-subjects-data.json");
    }
  }

  const juniorTopics = existingTopics.filter(
    (t) => t.grade !== null && t.grade <= 7,
  );

  if (juniorTopics.length === 0) {
    const juniorFile = join(process.cwd(), "server", "atp-junior-data.json");

    if (existsSync(juniorFile)) {
      console.log("[Seed] Seeding Grade 1-7 topics...");
      await seedFromFile("atp-junior-data.json");
    }
  }
}

async function seedFromFile(filename: string, defaultSubject?: string) {
  const dataPath = join(process.cwd(), "server", filename);
  const raw = readFileSync(dataPath, "utf-8");

  const topics: {
    grade: number;
    term: number;
    week: number;
    topic: string;
    content: string;
    subject?: string;
  }[] = JSON.parse(raw);

  console.log(`[Seed] Loading ${topics.length} ATP topics from ${filename}`);

  const batchSize = 20;

  for (let i = 0; i < topics.length; i += batchSize) {
    const batch = topics.slice(i, i + batchSize).map((t) => ({
      ...t,
      subject: t.subject || defaultSubject || "Mathematics",
    }));

    await db.insert(atp_topics).values(batch);

    console.log(`[Seed] Inserted batch ${Math.floor(i / batchSize) + 1}`);
  }
}
