// const TrainingProgram = require("../Models/courses");
// const Category = require("../Models/category");
// const { GoogleGenerativeAI } = require("@google/generative-ai");

// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// exports.aiChat = async (req, res) => {
//   try {
//     const { query } = req.body;

//     if (!query) {
//       return res.status(400).json({
//         success: false,
//         message: "Query is required",
//       });
//     }

//     const category = await Category.findOne({
//       name: { $regex: query, $options: "i" },
//     });

//     let programs;

//     if (category) {
//       programs = await TrainingProgram.find({ category: category._id })
//         .populate("ratingAndReviews")
//         .populate("studentEnrolled");
//     } else {
//       programs = await TrainingProgram.find({})
//         .populate("ratingAndReviews")
//         .populate("studentEnrolled");
//     }

//     const programDataForAI = programs.map((program) => {
//       const avgRating =
//         program.ratingAndReviews.length > 0
//           ? program.ratingAndReviews.reduce(
//               (sum, r) => sum + r.rating,
//               0
//             ) / program.ratingAndReviews.length
//           : 0;

//       return {
//         programName: program.courseName,
//         category: category?.name || "Mixed",
//         price: program.price,
//         studentsEnrolled: program.studentEnrolled.length,
//         avgRating: avgRating.toFixed(2),
//         tags: program.tag,
//       };
//     });

//     const prompt = `
//     You are the AI coaching assistant for Vijayvargiya Spoken English / Bold Voice.

//     User Query: "${query}"

//     Available training programs and batches (JSON):
//     ${JSON.stringify(programDataForAI, null, 2)}

//     Your task:
//     - Recommend the best 2-3 programs or batches based on:
//       - Highest ratings
//       - Most students enrolled
//       - Relevance to user's query
//     - Explain in simple Hinglish.
//     - Use only the given program data.
//     `;

//     const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
//     const result = await model.generateContent(prompt);
//     const aiResponse = result.response.text();

//     res.status(200).json({
//       success: true,
//       aiAnswer: aiResponse,
//       coursesConsidered: programDataForAI,
//       programsConsidered: programDataForAI,
//     });

//   } catch (error) {
//     console.error("AI Error:", error.message);

//     res.status(500).json({
//       success: false,
//       message: "AI processing failed",
//       error: error.message,
//     });
//   }
// };
