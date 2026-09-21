const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
require("dotenv").config();
const mongoose = require("mongoose");
const Dharamshala = require("../Models/dharamshala");
const DharamshalaBooking = require("../Models/dharamshalaBooking");
const DonationCampaign = require("../Models/donationCampaign");

async function main() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to MongoDB");

  // 1. Remove fake dharamshala records (Haridwar, Varanasi, etc.)
  const delRes = await Dharamshala.deleteMany({
    $or: [
      { name: { $regex: /Haridwar|Kutch|Bhavan|Varanasi/i } },
      { "location.city": { $in: ["Haridwar", "Varanasi"] } }
    ]
  });
  console.log("Deleted fake dharamshalas:", delRes.deletedCount);

  // 2. Check if Ujjain Dharamshala exists, create if not
  let ujjain = await Dharamshala.findOne({ "location.city": "Ujjain" });
  if (!ujjain) {
    ujjain = await Dharamshala.create({
      name: "Halba Samaj Dharamshala",
      slug: "halba-samaj-dharamshala-ujjain",
      tagline: "Shri Vitthal Mandir, Narsingh Ghat Road, Ujjain",
      description: "Official guest facility of Halba Samaj, Ujjain. Providing clean and peaceful accommodation with 5 Rooms (2 AC with Attached Toilet, 3 Non-AC with Non-Attached Toilet) and 1 Big Hall. Samaj members get 50% discount.",
      location: {
        address: "Shri Vitthal Mandir, Narsingh Ghat Road, Kalika Mata Mandir ke pichhe",
        city: "Ujjain",
        state: "Madhya Pradesh",
        pincode: "456006",
        landmark: "Kalika Mata Mandir ke pichhe, Narsingh Ghat"
      },
      mainImage: "",
      images: [],
      roomTypes: [
        {
          name: "AC Room (Attached Toilet)",
          description: "Double room with attached toilet. Maximum 4 persons per room.",
          capacity: 4,
          totalRooms: 2,
          pricePerNight: 1200,
          amenities: ["Air Conditioning", "Attached Toilet", "Double Bed"]
        },
        {
          name: "Non-AC Room (Non-Attached Toilet)",
          description: "Double room with non-attached toilet. Maximum 4 persons per room.",
          capacity: 4,
          totalRooms: 3,
          pricePerNight: 800,
          amenities: ["Ceiling Fan", "Non-Attached Toilet", "Double Bed"]
        },
        {
          name: "Big Hall",
          description: "1 Big Hall for community gatherings and large pilgrim groups.",
          capacity: 25,
          totalRooms: 1,
          pricePerNight: 3000,
          amenities: ["Spacious Hall", "Clean Facilities"]
        }
      ],
      facilities: [
        "5 Rooms (All Double, Max 4 persons per room)",
        "1 Big Hall",
        "2 AC Rooms with Attached Toilet",
        "3 Non-AC Rooms with Non-Attached Toilet",
        "Shri Vitthal Mandir Campus",
        "Narsingh Ghat Road, Behind Kalika Mata Mandir, Ujjain",
      ],
      rules: [
        "Original ID is mandatory",
        "Smoking prohibited",
        "Drinking prohibited",
        "Non-veg prohibited",
        "Guest is responsible for their valuables",
        "Check-in: 12:00 AM (Timing to be confirmed), Check-out: 10:00 AM",
        "Cancellation before 24 hours: 50% refund, After 24 hours: No refund"
      ],
      checkInTime: "12:00 AM",
      checkOutTime: "10:00 AM",
      cancellationPolicy: "Before 24 hours: 50% refund. After 24 hours: No refund.",
      contactPhone: "+91 88271 96257",
      contactEmail: "admin@halbasamaj.org",
      status: "ACTIVE",
      totalCapacity: 45
    });
    console.log("Created real Ujjain Dharamshala:", ujjain._id);
  } else {
    // Ensure all client fields match
    ujjain.name = "Halba Samaj Dharamshala";
    ujjain.checkInTime = "12:00 AM";
    ujjain.checkOutTime = "10:00 AM";
    ujjain.location.address = "Shri Vitthal Mandir, Narsingh Ghat Road, Kalika Mata Mandir ke pichhe";
    ujjain.location.city = "Ujjain";
    ujjain.status = "ACTIVE";
    await ujjain.save();
    console.log("Ujjain Dharamshala verified:", ujjain._id);
  }

  // 3. Update existing bookings
  await DharamshalaBooking.updateMany({}, {
    dharamshala: ujjain._id,
    dharamshalaName: "Halba Samaj Dharamshala"
  });
  console.log("Updated bookings to point to Ujjain");

  // 4. Activate the 2 real donation campaigns and clear past endDate so they show on /donate
  const campRes = await DonationCampaign.updateMany(
    { title: { $ne: "hi" } },
    {
      $set: {
        status: "ACTIVE",
        endDate: null
      },
      $unset: {
        archivedAt: 1,
        archivedBy: 1,
        archiveReason: 1
      }
    }
  );
  console.log("Activated real donation campaigns:", campRes.modifiedCount);

  // Clean up the test campaign "hi"
  await DonationCampaign.deleteOne({ title: "hi" });
  console.log("Deleted test campaign 'hi'");

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
