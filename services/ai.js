import dotenv from "dotenv";

dotenv.config();

/**
 * Sends a Prompt to OpenRouter AI Endpoint utilizing the 'openrouter/free' Auto-Router.
 * This automatically selects an active free model from the available pool so it never fails on 429s.
 */
export async function askAI(prompt) {
  const apiKey = process.env.OPENROUTER_API;
  if (!apiKey) throw new Error("OPENROUTER_API is not configured in `.env`!");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s Timeout

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/m/f", 
      },
      body: JSON.stringify({
        model: "openrouter/free", // <-- The Master Free Router!
        messages: [
          { 
            role: "system", 
            content: "You are a professional Project Manager Assistant. Help summarize tasks and motivate the team with clean, concise formatting." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.5,
      })
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (data.choices && data.choices[0]?.message?.content) {
      return data.choices[0].message.content;
    } else if (data.error) {
       import("fs").then(fs => {
         fs.writeFileSync("debug-ai.json", JSON.stringify(data.error, null, 2));
       }).catch(() => {});
       throw new Error(data.error.message || JSON.stringify(data.error));
    }

  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error("AI Request timed out. The provider took too long to respond.");
    }
    throw err;
  }
}
