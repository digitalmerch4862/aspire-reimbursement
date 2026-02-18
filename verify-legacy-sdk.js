
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = "AIzaSyAHkuV5mgPsAofjWXGWfH4qqwViZOrDJZA";
const genAI = new GoogleGenerativeAI(apiKey);

async function run() {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    try {
        const result = await model.generateContent("Hello!");
        console.log("Success with @google/generative-ai!");
        console.log(result.response.text());
    } catch (error) {
        console.error("Failed with @google/generative-ai:", error.message);
    }
}

run();
