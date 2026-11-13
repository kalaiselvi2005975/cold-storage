/**
 * SMART FRUIT & VEGETABLE COLD STORAGE MANAGEMENT SYSTEM
 * Firebase Cloud Functions
 * 
 * 1. FCM Push Notification Engine (preserved from original)
 * 2. AI Image Analysis Endpoint (NEW — Gemini Vision API)
 * 
 * SECURITY: Gemini API key is stored as a Firebase environment secret.
 * Set it with: firebase functions:secrets:set GEMINI_API_KEY
 * The API key is NEVER exposed to the frontend.
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown per chamber + alert type

// ============================================================================
// 1. FCM PUSH NOTIFICATION ON NEW READING (preserved from original)
// ============================================================================
exports.sendFcmNotificationOnReading = functions.database
  .ref("ColdStorage/readings/{pushId}")
  .onCreate(async (snapshot, context) => {
    const reading = snapshot.val();
    if (!reading) return null;

    const chamberId = reading.chamberId || "C1";
    const temp = reading.temperature;
    const target = reading.targetTemperature;
    const fan = reading.fanSpeed || 0;
    const demand = reading.coolingDemand || "LOW";

    // Fetch previous reading for trend
    const lastReadingsSnap = await admin.database()
      .ref("ColdStorage/readings")
      .orderByChild("chamberId")
      .equalTo(chamberId)
      .limitToLast(2)
      .once("value");

    let prevTemp = null;
    if (lastReadingsSnap.exists()) {
      const readings = Object.values(lastReadingsSnap.val());
      if (readings.length > 1) {
        prevTemp = readings[readings.length - 2].temperature;
      }
    }

    // Alert condition evaluation
    let alertType = null;
    let title = "";
    let body = "";

    if (demand === "HIGH") {
      alertType = "COOLING_DEMAND_HIGH";
      title = `🚨 ${chamberId} HIGH COOLING DEMAND`;
      body = `Temperature: ${temp}°C | Target: ${target}°C | Fan: ${fan}%`;
    } else if (temp !== null && target !== null && Math.abs(temp - target) > 2.0) {
      alertType = "TEMP_OUT_OF_RANGE";
      title = `⚠️ ${chamberId} Temperature Out of Range`;
      body = `Current: ${temp}°C | Target: ${target}°C`;
    }

    if (!alertType) return null;

    // Cooldown check
    const cooldownRef = admin.database().ref(`ColdStorage/notification_cooldowns/${chamberId}_${alertType}`);
    const cooldownSnap = await cooldownRef.once("value");
    const lastSentTime = cooldownSnap.val() || 0;
    const now = Date.now();

    if (now - lastSentTime < COOLDOWN_MS) {
      console.log(`⏳ Cooldown active for ${chamberId}_${alertType}`);
      return null;
    }

    // Get FCM tokens
    const tokensSnap = await admin.database().ref("ColdStorage/fcm_tokens").once("value");
    if (!tokensSnap.exists()) return null;

    const tokensMap = tokensSnap.val();
    const tokens = Object.values(tokensMap).map(t => typeof t === "string" ? t : t.token).filter(Boolean);
    if (tokens.length === 0) return null;

    await cooldownRef.set(now);

    const message = {
      notification: { title, body },
      data: { chamberId, alertType, timestamp: String(now), title, body },
      tokens: tokens
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`✅ FCM sent (${response.successCount} delivered): ${title}`);
      return response;
    } catch (error) {
      console.error("❌ FCM dispatch failed:", error);
      return null;
    }
  });

// ============================================================================
// 2. TEST FCM NOTIFICATION (preserved from original)
// ============================================================================
exports.sendTestNotification = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const tokensSnap = await admin.database().ref("ColdStorage/fcm_tokens").once("value");
    if (!tokensSnap.exists()) {
      res.status(400).json({ success: false, error: "No registered FCM tokens." });
      return;
    }

    const tokensMap = tokensSnap.val();
    const tokens = Object.values(tokensMap).map(t => typeof t === "string" ? t : t.token).filter(Boolean);
    if (tokens.length === 0) {
      res.status(400).json({ success: false, error: "No active FCM tokens." });
      return;
    }

    const title = "🧪 Test Cold Storage Notification";
    const body = "FCM Web Push verified! You'll receive cold storage alerts on this device.";

    const message = {
      notification: { title, body },
      data: { title, body, isTest: "true" },
      tokens: tokens
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    res.status(200).json({
      success: true,
      deliveredCount: response.successCount,
      message: `Sent to ${response.successCount} device(s)`
    });
  } catch (error) {
    console.error("❌ Test FCM error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 3. AI IMAGE ANALYSIS — GEMINI VISION (NEW)
// ============================================================================
/**
 * Analyzes a chamber image using Google Gemini Vision API.
 * 
 * SETUP:
 * 1. Set your Gemini API key as a Firebase secret:
 *    firebase functions:secrets:set GEMINI_API_KEY
 * 
 * 2. The function receives: { chamberId, produceType, imageBase64 }
 * 3. Returns structured quality assessment (not raw JSON to the user)
 * 
 * SECURITY: API key is NEVER exposed to the frontend.
 */
exports.analyzeImage = functions
  .runWith({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 60, memory: "512MB" })
  .https.onRequest(async (req, res) => {
    // CORS
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, error: "Method not allowed" });
      return;
    }

    try {
      const { chamberId, produceType, imageBase64 } = req.body;

      if (!imageBase64) {
        res.status(400).json({ success: false, error: "No image data provided." });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("❌ GEMINI_API_KEY secret not set.");
        res.status(500).json({ success: false, error: "AI service not configured. Set GEMINI_API_KEY secret." });
        return;
      }

      // Construct Gemini Vision API request
      const prompt = `You are performing a visual quality assessment of fruits or vegetables stored in a cold-storage chamber.

The produce type stored in this chamber is: ${produceType || "unknown"}.

Analyze the entire image as a whole. Do NOT provide individual produce reports.

Provide ONE overall chamber-level assessment.

Consider visible:
- discoloration
- dark spots
- bruising
- shriveling
- mold-like growth
- visible rot
- severe surface damage
- leakage
- abnormal appearance

Classify the overall visible condition as one of: GOOD, WARNING, or SPOILED.

If the image quality is insufficient for a confident GOOD assessment, use WARNING.

Do NOT claim to determine internal freshness, microbial safety, exact shelf life, or hidden internal damage.

Respond ONLY with valid JSON in this exact format (no extra text):
{
  "overallCondition": "GOOD or WARNING or SPOILED",
  "summary": "A short human-readable sentence describing visible quality",
  "totalDetected": <number of visible produce items>,
  "goodCount": <estimated number in good condition>,
  "warningCount": <estimated number showing early deterioration>,
  "spoiledCount": <estimated number showing severe deterioration>,
  "confidence": <confidence percentage as integer 0-100>
}`;

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const geminiPayload = {
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 500
        }
      };

      // Call Gemini API (using Node 18 built-in global fetch)
      const geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini API error:", geminiResponse.status, errorText);
        res.status(500).json({ success: false, error: `Gemini API returned ${geminiResponse.status}` });
        return;
      }

      const geminiResult = await geminiResponse.json();

      // Extract text from Gemini response
      let responseText = "";
      if (geminiResult.candidates && geminiResult.candidates[0] && geminiResult.candidates[0].content) {
        responseText = geminiResult.candidates[0].content.parts
          .map(p => p.text || "")
          .join("");
      }

      // Parse JSON from response (handle markdown code blocks)
      let parsed;
      try {
        // Remove markdown code fences if present
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith("```")) {
          cleanJson = cleanJson.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim();
        }
        parsed = JSON.parse(cleanJson);
      } catch (parseErr) {
        console.error("Failed to parse Gemini response as JSON:", responseText);
        // Fallback: return a WARNING result
        parsed = {
          overallCondition: "WARNING",
          summary: "AI analysis could not produce a structured result. Manual inspection recommended.",
          totalDetected: 0,
          goodCount: 0,
          warningCount: 0,
          spoiledCount: 0,
          confidence: 0
        };
      }

      // Validate and sanitize the response
      const validConditions = ["GOOD", "WARNING", "SPOILED"];
      if (!validConditions.includes((parsed.overallCondition || "").toUpperCase())) {
        parsed.overallCondition = "WARNING";
      } else {
        parsed.overallCondition = parsed.overallCondition.toUpperCase();
      }

      parsed.totalDetected = parseInt(parsed.totalDetected) || 0;
      parsed.goodCount = parseInt(parsed.goodCount) || 0;
      parsed.warningCount = parseInt(parsed.warningCount) || 0;
      parsed.spoiledCount = parseInt(parsed.spoiledCount) || 0;
      parsed.confidence = Math.min(100, Math.max(0, parseInt(parsed.confidence) || 0));

      // Store result in Firebase
      const timeNow = new Date().toISOString();
      const aiData = {
        ...parsed,
        lastChecked: timeNow,
        imageUrl: null // Could upload to Firebase Storage if desired
      };

      if (chamberId) {
        await admin.database().ref(`ColdStorage/chambers/${chamberId}/ai`).set(aiData);
      }

      console.log(`✅ AI analysis for ${chamberId}: ${parsed.overallCondition} (confidence: ${parsed.confidence}%)`);

      res.status(200).json({ success: true, data: aiData });

    } catch (error) {
      console.error("❌ analyzeImage error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
