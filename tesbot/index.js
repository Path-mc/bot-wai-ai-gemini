const { GoogleGenerativeAI, GoogleGenerativeAIResponseError } = require("@google/generative-ai");
const whatsapp = require('velixs-md'); // Pastikan ini diimpor dengan benar

// Gunakan model baru dengan prompt khusus
const genAI = new GoogleGenerativeAI('isi api key dari gemini'); // Ganti dengan API Key Anda
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-exp-0827",
    systemInstruction: "(isi model atau prompt disini",
  });

  const generationConfig = {
    temperature: 2, // Temperature respon AI
    topP: 0.95,
    topK: 64,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
    safetySettings: [ // Filter respon AI
        {
            "category": "HARM_CATEGORY_DEROGATORY",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_TOXICITY",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_VIOLENCE",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_SEXUAL",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_MEDICAL",
            "threshold": "BLOCK_NONE"
        },
        {
            "category": "HARM_CATEGORY_DANGEROUS",
            "threshold": "BLOCK_NONE"
        }
    ] 
};

// Inisialisasi objek untuk menyimpan riwayat percakapan dan status AI per kontak
const conversationHistories = {};
const aiStatus = {}; // Untuk melacak apakah AI aktif atau tidak per kontak

// Mulai sesi WhatsApp dengan velixs-md
whatsapp.startSession('nama_session');

// Ketika WhatsApp terhubung
whatsapp.onConnected(async (session) => {
    console.log("Session connected: " + session);
});

// Ketika pesan baru diterima
whatsapp.onMessageReceived(async (message) => {
    if (message.key.fromMe || message.key.remoteJid.includes("status")) return;

    const contact = message.key.remoteJid;
    const messageBody = message.message?.extendedTextMessage?.text.toLowerCase().trim() || '';
    const isGroupChat = message.key.remoteJid.endsWith('@g.us');

    console.log("Received message:", messageBody, "from:", contact); // Log pesan yang diterima

    // Cek perintah ".on" untuk mengaktifkan AI
    if (messageBody === '.on') {
        aiStatus[contact] = true; // Aktifkan AI untuk kontak ini
        await whatsapp.sendTextMessage({
            sessionId: message.sessionId,
            to: contact,
            text: "AI diaktifkan. Silakan kirim pesan untuk memulai percakapan.",
            answering: message,
            isGroup: isGroupChat,
        });
        console.log("AI activated for:", contact); // Log aktivasi AI
        return;
    }

    // Cek perintah ".off" untuk menonaktifkan AI
    if (messageBody === '.off') {
        aiStatus[contact] = false; // Nonaktifkan AI untuk kontak ini
        await whatsapp.sendTextMessage({
            sessionId: message.sessionId,
            to: contact,
            text: "AI dinonaktifkan, kirim '.on' untuk mengaktifkannya kembali.",
            answering: message,
            isGroup: isGroupChat,
        });
        console.log("AI deactivated for:", contact); // Log deaktivasai AI
        return;
    }

    // Jika AI tidak diaktifkan untuk kontak ini, jangan respon apapun
    if (!aiStatus[contact]) {
        console.log("AI is not active for:", contact); // Log jika AI tidak aktif
        return; // Bot tidak merespon jika status AI tidak aktif
    }

    // Cek apakah pesan ini adalah tag ke bot di grup
    const isTaggingAI = isGroupChat && message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.includes("6282314571381@s.whatsapp.net");

    console.log("isTaggingAI:", isTaggingAI, "mentioned JIDs:", message.message?.extendedTextMessage?.contextInfo?.mentionedJid);

    // Jika pesan ini adalah tag ke bot
    if (isTaggingAI) {
        console.log("Message is a tag to bot"); // Log untuk menandai bot

        // Jika belum ada riwayat untuk kontak ini, inisialisasi array baru
        if (!conversationHistories[contact]) {
            conversationHistories[contact] = []; // Inisialisasi array jika belum ada
        }

        // Tambahkan pesan baru ke riwayat percakapan
        conversationHistories[contact].push({ body: messageBody });

        // Gabungkan riwayat percakapan ke dalam satu string untuk dikirim ke AI
        const context = conversationHistories[contact].map((msg) => `${msg.body}`).join("\n");
        console.log("Context for AI:", context); // Log konteks untuk AI

        try {
            // Kirim ke model AI dengan riwayat percakapan, ditambah pesan terbaru
            const result = await model.generateContent(`${context}\n${messageBody}`, generationConfig);
            const prompt = `${context}\n${messageBody}\n\nSilakan balas tanpa catatan tambahan.`;

            
            // Kirim respons ke WhatsApp hanya ke kontak yang bersangkutan
            await whatsapp.sendTextMessage({
                sessionId: message.sessionId,
                to: contact,
                text: result.response.text(),
                answering: message,
                isGroup: isGroupChat, // Pastikan ini benar
            });

            // Tambahkan log untuk memastikan pesan dikirim
            console.log(`Sending message to ${contact}: ${result.response.text()}`);

            // Simpan respons AI ke dalam riwayat percakapan
            conversationHistories[contact].push({ body: result.response.text() });

        } catch (error) {
            if (error instanceof GoogleGenerativeAIResponseError) {
                console.error("Response blocked due to safety:", error.response);
                await whatsapp.sendTextMessage({
                    sessionId: message.sessionId,
                    to: contact,
                    text: "AI tidak dapat memberikan respons. coba yang lain bah.",
                    answering: message,
                    isGroup: isGroupChat,
                });
            } else {
                console.error("Error generating response from AI:", error);
                await whatsapp.sendTextMessage({
                    sessionId: message.sessionId,
                    to: contact,
                    text: "error wak.",
                    answering: message,
                    isGroup: isGroupChat,
                });
            }
        }
    } else {
        // Jika bukan tag, dan AI aktif, balas pesan tanpa prefix
        if (!isGroupChat) {
            // Untuk chat pribadi, pastikan untuk menginisialisasi riwayat jika belum ada
            if (!conversationHistories[contact]) {
                conversationHistories[contact] = []; // Inisialisasi array jika belum ada
            }

            const context = conversationHistories[contact]?.map((msg) => msg.body).join("\n") || '';
            console.log("Context for AI in private chat:", context); // Log konteks untuk chat pribadi
            
            // Tambahkan pesan baru ke riwayat percakapan
            conversationHistories[contact].push({ body: messageBody });

            try {
                // Kirim ke model AI dengan riwayat percakapan, ditambah pesan terbaru
                const prompt = `${context}\n${messageBody}\n\nBalas dengan dialog saja, tanpa catatan atau penjelasan tambahan.`;
                const result = await model.generateContent(prompt, generationConfig);

                // Menghapus catatan jika ada
                let responseText = result.response.text();
                const noteRegex = /Catatan:.*$/; // Regex untuk mencocokkan catatan
                responseText = responseText.replace(noteRegex, '').trim();

                
                // Kirim respons ke WhatsApp
                await whatsapp.sendTextMessage({
                    sessionId: message.sessionId,
                    to: contact,
                    text: result.response.text(),
                    answering: message,
                    isGroup: isGroupChat, // Pastikan ini benar
                });

                // Tambahkan log untuk memastikan pesan dikirim
                console.log(`Sending message to ${contact}: ${result.response.text()}`);

                // Simpan respons AI ke dalam riwayat percakapan
                conversationHistories[contact].push({ body: result.response.text() });

            } catch (error) {
                console.error("Error generating response from AI:", error);
                await whatsapp.sendTextMessage({
                    sessionId: message.sessionId,
                    to: contact,
                    text: "error wak.",
                    answering: message,
                    isGroup: isGroupChat,
                });
            }
        }
    }
});
