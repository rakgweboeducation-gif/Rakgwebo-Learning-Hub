import { storage } from "../server/storage";
import { db } from "../server/db";
import { textbooks, atpTopics } from "@shared/schema";

async function seed() {
  console.log("Seeding database...");

  // clear existing data (optional, be careful in prod)
  // await db.delete(textbooks);
  // await db.delete(atpTopics);

  const books = await storage.getTextbooks();
  if (books.length === 0) {
    await storage.createTextbook({
      title: "Mathematics Grade 10",
      grade: 10,
      url: "https://www.education.gov.za/LinkClick.aspx?fileticket=8lG1w4w0w0I%3d&tabid=670&portalid=0&mid=2498", // Example URL
      coverUrl: "https://via.placeholder.com/150",
    });
    await storage.createTextbook({
      title: "Mathematics Grade 11",
      grade: 11,
      url: "https://www.education.gov.za/LinkClick.aspx?fileticket=8lG1w4w0w0I%3d&tabid=670&portalid=0&mid=2498",
      coverUrl: "https://via.placeholder.com/150",
    });
    await storage.createTextbook({
      title: "Mathematics Grade 12",
      grade: 12,
      url: "https://www.education.gov.za/LinkClick.aspx?fileticket=8lG1w4w0w0I%3d&tabid=670&portalid=0&mid=2498",
      coverUrl: "https://via.placeholder.com/150",
    });
  }

  const topics = await storage.getATPTopics();
  if (topics.length === 0) {
    await db.insert(atpTopics).values([
      { grade: 10, term: 1, week: 1, topic: "Algebraic Expressions", content: "Factorisation, simplification..." },
      { grade: 10, term: 1, week: 2, topic: "Exponents", content: "Laws of exponents..." },
      { grade: 11, term: 1, week: 1, topic: "Exponents and Surds", content: "Simplifying surds..." },
      { grade: 12, term: 1, week: 1, topic: "Sequences and Series", content: "Arithmetic and Geometric sequences..." },
    ]);
  }

  console.log("Seeding complete!");
}

seed().catch(console.error);
