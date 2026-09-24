const schedule = require("node-schedule");
const Notice = require("../Models/notice");
const Job = require("../Models/job");
const Scholarship = require("../Models/scholarship");
const DonationCampaign = require("../Models/donationCampaign");
const Donation = require("../Models/donation");
const MonthlyContribution = require("../Models/monthlyContribution");
const MonthlyContributionCycle = require("../Models/monthlyContributionCycle");
const Poll = require("../Models/poll");
const Shradhanjali = require("../Models/shradhanjali");
const User = require("../Models/user");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DharamshalaReservationHold = require("../Models/dharamshalaReservationHold");
const { notifyUser } = require("./notificationService");

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

  const expiredBookings = await DharamshalaBooking.find({ status: "PAYMENT_PENDING", paymentDeadline: { $lte: now } })
    .select("_id requester bookingReference statusHistory");
  await Promise.all(expiredBookings.map(async (booking) => {
    booking.status = "PAYMENT_EXPIRED";
    booking.paymentStatus = "FAILED";
    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({ status: "PAYMENT_EXPIRED", paymentStatus: "FAILED", changedAt: now, note: "Payment deadline expired" });
    await booking.save();
    await DharamshalaReservationHold.deleteMany({ booking: booking._id });
    if (booking.requester) {
      await notifyUser({
        recipient: booking.requester,
        title: "Dharamshala payment expired",
        message: `Payment window for booking ${booking.bookingReference || booking._id} has expired.`,
        metadata: { booking: booking._id },
      });
    }
  }));

  const changed =
    notices.modifiedCount +
    jobs.modifiedCount +
    scholarships.modifiedCount +
    campaigns.modifiedCount +
    contributions.modifiedCount +
    polls.modifiedCount +
    shradhanjalis.modifiedCount +
    staleDonations.modifiedCount + expiredBookings.length;

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
      dharamshalaPaymentsExpired: expiredBookings.length,
    });
  }
}

async function autoGenerateMonthlyContributions() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const dueStartDate = new Date(year, month - 1, 1);
  const dueDate = new Date(year, month - 1, 10, 23, 59, 59); // 10th of the month
  const defaultAmount = Number(process.env.DEFAULT_MONTHLY_CONTRIBUTION || 60);
  const lateFeeAmount = 2;

  let cycle = await MonthlyContributionCycle.findOne({ month, year });
  if (!cycle) {
    cycle = await MonthlyContributionCycle.create({
      month,
      year,
      title: `${now.toLocaleString("en-US", { month: "long" })} ${year}`,
      contributionAmount: defaultAmount,
      dueStartDate,
      dueDate,
      lateFeeAmount,
      description: `Monthly contribution cycle for ${now.toLocaleString("en-US", { month: "long" })} ${year}`,
      status: "OPEN",
    });
  }

  const members = await User.find({ active: true, accountStatus: "ACTIVE", roles: "MEMBER" }).select("_id family");
  if (!members.length) return;

  const results = await Promise.allSettled(
    members.map((member) =>
      MonthlyContribution.create({
        member: member._id,
        family: member.family,
        cycle: cycle._id,
        month,
        year,
        expectedAmount: cycle.contributionAmount || defaultAmount,
        totalPayable: cycle.contributionAmount || defaultAmount,
        dueStartDate,
        dueDate: cycle.dueDate || dueDate,
      })
    )
  );

  const created = results.filter((r) => r.status === "fulfilled").length;
  await MonthlyContributionCycle.findByIdAndUpdate(cycle._id, { eligibleMembersCount: members.length });
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
