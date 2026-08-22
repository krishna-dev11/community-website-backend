const schedule = require("node-schedule");
const Notice = require("../Models/notice");
const Job = require("../Models/job");
const Scholarship = require("../Models/scholarship");
const DonationCampaign = require("../Models/donationCampaign");
const Donation = require("../Models/donation");
const MonthlyContribution = require("../Models/monthlyContribution");
const Poll = require("../Models/poll");
const Shradhanjali = require("../Models/shradhanjali");
const User = require("../Models/user");

async function expireTimeBoundRecords() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [notices, jobs, scholarships, campaigns, contributions, polls, shradhanjalis, staleDonations] = await Promise.all([
    Notice.updateMany(
      { status: "PUBLISHED", expiresAt: { $lte: now } },
      { status: "EXPIRED" }
    ),
    Job.updateMany(
      { status: "PUBLISHED", expiresAt: { $lte: now } },
      { status: "EXPIRED" }
    ),
    Scholarship.updateMany(
      { status: "OPEN", applicationDeadline: { $lte: now } },
      { status: "CLOSED" }
    ),
    DonationCampaign.updateMany(
      { status: "ACTIVE", endDate: { $lte: now } },
      { status: "EXPIRED" }
    ),
    MonthlyContribution.updateMany(
      { status: { $in: ["PENDING", "PARTIAL"] }, dueDate: { $lt: now } },
      { status: "OVERDUE" }
    ),
    Poll.updateMany(
      { status: "ACTIVE", endsAt: { $lte: now } },
      { status: "CLOSED" }
    ),
    Shradhanjali.updateMany(
      { status: "PUBLISHED", createdAt: { $lte: ninetyDaysAgo } },
      { status: "ARCHIVED" }
    ),
    Donation.updateMany(
      { status: "PENDING", createdAt: { $lte: oneDayAgo } },
      { status: "FAILED" }
    ),
  ]);

  const changed =
    notices.modifiedCount +
    jobs.modifiedCount +
    scholarships.modifiedCount +
    campaigns.modifiedCount +
    contributions.modifiedCount +
    polls.modifiedCount +
    shradhanjalis.modifiedCount +
    staleDonations.modifiedCount;

  if (changed > 0) {
    console.log("Scheduled cron sweep completed", {
      notices: notices.modifiedCount,
      jobs: jobs.modifiedCount,
      scholarships: scholarships.modifiedCount,
      campaigns: campaigns.modifiedCount,
      contributions: contributions.modifiedCount,
      polls: polls.modifiedCount,
      shradhanjalis: shradhanjalis.modifiedCount,
      staleDonations: staleDonations.modifiedCount,
    });
  }
}

async function autoGenerateMonthlyContributions() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const dueDate = new Date(year, month - 1, 15); // Due on 15th of the month
  const defaultAmount = Number(process.env.DEFAULT_MONTHLY_CONTRIBUTION || 100);

  const members = await User.find({ active: true, accountStatus: "ACTIVE", roles: "MEMBER" }).select("_id family");
  if (!members.length) return;

  const results = await Promise.allSettled(
    members.map((member) =>
      MonthlyContribution.create({
        member: member._id,
        family: member.family,
        month,
        year,
        expectedAmount: defaultAmount,
        dueDate,
      })
    )
  );

  const created = results.filter((r) => r.status === "fulfilled").length;
  console.log(`[Cron] Auto-generated ${created} monthly contributions for ${month}/${year}`);
}

function startScheduledJobs() {
  // Run sweep every hour
  schedule.scheduleJob("0 * * * *", () => {
    expireTimeBoundRecords().catch((error) => {
      console.error("Scheduled expiry failed", error);
    });
  });

  // Run monthly contribution generation on 1st of every month at midnight (00:05 AM)
  schedule.scheduleJob("5 0 1 * *", () => {
    autoGenerateMonthlyContributions().catch((error) => {
      console.error("Auto contribution generation failed", error);
    });
  });
}

module.exports = {
  expireTimeBoundRecords,
  autoGenerateMonthlyContributions,
  startScheduledJobs,
};
