const schedule = require("node-schedule");
const Notice = require("../Models/notice");
const Job = require("../Models/job");
const Scholarship = require("../Models/scholarship");
const DonationCampaign = require("../Models/donationCampaign");
const MonthlyContribution = require("../Models/monthlyContribution");
const Poll = require("../Models/poll");

async function expireTimeBoundRecords() {
  const now = new Date();

  const [notices, jobs, scholarships, campaigns, contributions, polls] = await Promise.all([
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
  ]);

  const changed = notices.modifiedCount + jobs.modifiedCount + scholarships.modifiedCount + campaigns.modifiedCount + contributions.modifiedCount + polls.modifiedCount;
  if (changed > 0) {
    console.log("Scheduled expiry completed", {
      notices: notices.modifiedCount,
      jobs: jobs.modifiedCount,
      scholarships: scholarships.modifiedCount,
      campaigns: campaigns.modifiedCount,
      contributions: contributions.modifiedCount,
      polls: polls.modifiedCount,
    });
  }
}

function startScheduledJobs() {
  schedule.scheduleJob("0 * * * *", () => {
    expireTimeBoundRecords().catch((error) => {
      console.error("Scheduled expiry failed", error);
    });
  });
}

module.exports = {
  expireTimeBoundRecords,
  startScheduledJobs,
};
