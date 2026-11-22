require("dotenv").config();
const mongoose = require("mongoose");
const Problem = require("./src/models/problem");
const User = require("./src/models/user");
const problems = require("./codeforge_problems.json");

async function seedProblems() {
  try {
    if (!process.env.DB_CONNECT_STRING) throw new Error("DB_CONNECT_STRING missing in backend/.env");
    await mongoose.connect(process.env.DB_CONNECT_STRING);
    console.log("Connected to MongoDB");
    const admin = await User.findOne({ role: "admin" });
    if (!admin) throw new Error("Admin user not found. Create an admin account first.");
    let inserted = 0, skipped = 0, failed = 0;
    for (const data of problems) {
      try {
        if (await Problem.exists({ title: data.title })) {
          console.log("Skipping existing:", data.title);
          skipped++;
          continue;
        }
        await Problem.create({ ...data, problemCreator: admin._id });
        console.log("Inserted:", data.title);
        inserted++;
      } catch (error) {
        console.error("Failed:", data.title, error.message);
        failed++;
      }
    }
    console.log(`Finished: ${inserted} inserted, ${skipped} skipped, ${failed} failed.`);
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
seedProblems();
