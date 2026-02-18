
import { GoogleGenAI } from "@google/genai";

const apiKey = "AIzaSyAJqx884IZJuOY67dJuAf2vqECAXRLuwBY";
const ai = new GoogleGenAI({ apiKey: apiKey });

async function checkModels() {
    const models = [
        "gemini-3-flash-preview", // The one originally in the code
        "gemini-2.5-flash",       // A potential stable alternative
        "gemini-flash-latest"     // Generic alias
    ];

    console.log("Checking available models...");

    for (const model of models) {
        try {
            console.log(`Testing ${model}...`);
            const response = await ai.models.generateContent({
                model: model,
                contents: [{
                    role: "user",
                    parts: [{ text: "Hello!" }]
                }]
            });
            console.log(`SUCCESS with ${model}!`);
        } catch (error) {
            console.log(`Failed with ${model}: ${error.message.substring(0, 100)}...`);
        }
    }
}

checkModels();
