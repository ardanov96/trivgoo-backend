const { GoogleGenerativeAI } = require("@google/generative-ai");

const handleChat = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: true, message: "Valid messages array is required." });
    }

    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not defined in .env");
      return res.status(500).json({ error: true, message: "Server API configuration error." });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const systemInstruction = `Anda adalah asisten virtual Trivgoo yang ramah, sopan, dan sangat membantu.
Tugas Anda: Membantu pelanggan Trivgoo mencari informasi paket wisata, staycation, sewa mobil, dan produk tur lainnya.
Aturan: 
1. Berikan jawaban yang ringkas dan informatif.
2. Gunakan bahasa Indonesia yang profesional namun santun.
3. Selalu siap merekomendasikan layanan Trivgoo dan arahkan pengguna untuk menjelajahi situs.`;

    // Ambil model Gemini terbaru yang direkomendasikan untuk tugas percakapan cepat
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction 
    });

    // Extract history and format it for Gemini API 
    // Format frontend [{ role: 'user' | 'bot', content: '...' }]
    // Format Gemini [{ role: 'user' | 'model', parts: [{text: '...'}] }]
    
    // Gemini history array must start with a 'user' role and alternate.
    // We will skip the initial 'bot' greeting message from the frontend if it's the first one.
    let history = [];
    let historyStarted = false;
    
    const previousMessages = messages.slice(0, -1);
    for (const msg of previousMessages) {
      if (msg.role === 'user') {
        historyStarted = true;
      }
      
      if (historyStarted) {
        history.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      }
    }

    const latestUserMessage = messages[messages.length - 1];
    
    console.log("SENDING TO GEMINI:");
    console.log("HISTORY:", JSON.stringify(history, null, 2));
    console.log("USER MESSAGE:", latestUserMessage.content);

    // Inisialisasi obrolan
    const chat = model.startChat({ history });

    // Kirim pesan terbaru
    const result = await chat.sendMessage(latestUserMessage.content);
    const responseText = result.response.text();

    return res.status(200).json({
      error: false,
      reply: responseText
    });

  } catch (error) {
    console.error("Gemini AI API Error:", error.message || error);
    return res.status(500).json({ error: true, message: error.message || "Terjadi kesalahan saat menghubungi asisten AI." });
  }
};

module.exports = {
  handleChat
};
