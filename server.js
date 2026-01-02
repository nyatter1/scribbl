<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TERMINAL | Central Command</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;700&display=swap');
        
        body {
            background-color: #0a0a0a;
            color: #00ff41;
            font-family: 'Fira+Code', monospace;
            overflow-x: hidden;
        }

        .crt-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), 
                        linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
            background-size: 100% 2px, 3px 100%;
            pointer-events: none;
            z-index: 999;
        }

        .terminal-border {
            border: 1px solid #00ff41;
            box-shadow: 0 0 15px rgba(0, 255, 65, 0.2);
        }

        .scanline {
            width: 100%;
            height: 2px;
            background: rgba(0, 255, 65, 0.1);
            position: absolute;
            animation: scanline 6s linear infinite;
        }

        @keyframes scanline {
            0% { top: 0; }
            100% { top: 100%; }
        }

        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #050505; }
        ::-webkit-scrollbar-thumb { background: #00ff41; }
        
        .input-cursor {
            display: inline-block;
            width: 10px;
            height: 20px;
            background: #00ff41;
            animation: blink 1s infinite;
            vertical-align: middle;
        }

        @keyframes blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
    </style>
</head>
<body class="p-4 md:p-8 min-h-screen">
    <div class="crt-overlay"></div>
    <div class="scanline"></div>

    <!-- MAIN CONTAINER -->
    <div class="max-w-6xl mx-auto h-[90vh] flex flex-col terminal-border bg-black bg-opacity-90 relative overflow-hidden">
        
        <!-- HEADER -->
        <header class="border-b border-green-500 p-4 flex justify-between items-center bg-green-900 bg-opacity-10">
            <div class="flex items-center gap-4">
                <span class="text-xs animate-pulse">● SYSTEM ONLINE</span>
                <h1 class="text-xl font-bold tracking-tighter uppercase">Terminal_v2.0.4</h1>
            </div>
            <div id="user-status" class="text-sm opacity-70">
                GUEST@LOCAL_HOST
            </div>
        </header>

        <!-- CHAT AREA -->
        <div id="chat-window" class="flex-grow overflow-y-auto p-6 space-y-4">
            <!-- DEBUG MESSAGE (Always Visible) -->
            <div class="text-yellow-500 border-l-2 border-yellow-500 pl-4 py-2 bg-yellow-900 bg-opacity-10">
                <p class="text-xs font-bold">[DEBUG_LOG] System initialised.</p>
                <p class="text-xs" id="connection-status">Checking backend connection...</p>
            </div>
            
            <div class="text-green-500 opacity-50 text-xs italic">
                -- End of previous session --
            </div>
        </div>

        <!-- INPUT AREA -->
        <div class="p-4 border-t border-green-500 bg-black">
            <div class="flex items-center gap-2">
                <span class="text-green-500 font-bold">></span>
                <input type="text" id="command-input" 
                       class="flex-grow bg-transparent outline-none text-green-400 border-none focus:ring-0 p-0"
                       placeholder="Enter message or command..." 
                       autocomplete="off">
                <div class="input-cursor"></div>
            </div>
        </div>

    </div>

    <!-- FOOTER INFO -->
    <div class="max-w-6xl mx-auto mt-2 flex justify-between text-[10px] uppercase opacity-50 px-2">
        <span>Latency: <span id="ping-val">--</span>ms</span>
        <span>Render Deployment Node: /src/index.html</span>
        <span>Secure Protocol: AES-256</span>
    </div>

    <script>
        const chatWindow = document.getElementById('chat-window');
        const commandInput = document.getElementById('command-input');
        const connStatus = document.getElementById('connection-status');
        const pingVal = document.getElementById('ping-val');

        /**
         * DEBUGGER: Backend Connectivity Test
         * This script verifies if the frontend can actually reach your server.js
         */
        async function checkConnection() {
            const start = Date.now();
            try {
                // We try to hit the messages endpoint to see if server is alive
                const response = await fetch('/api/messages');
                const duration = Date.now() - start;
                pingVal.innerText = duration;

                if (response.ok) {
                    connStatus.innerHTML = '<span class="text-green-400">STATUS_OK: Successfully reached server.js</span>';
                    console.log("Connection check: SUCCESS");
                    loadMessages();
                } else {
                    throw new Error(`Server returned status ${response.status}`);
                }
            } catch (err) {
                connStatus.innerHTML = `<span class="text-red-500">STATUS_CRITICAL: ${err.message}</span>`;
                console.error("Connection check: FAILED", err);
                
                const errorMsg = document.createElement('div');
                errorMsg.className = "text-red-400 text-xs mt-2";
                errorMsg.innerHTML = `[ERROR] Ensure server.js is running and 'app.use(express.static(path.join(__dirname)))' is configured properly.`;
                chatWindow.appendChild(errorMsg);
            }
        }

        function appendMessage(user, text, isSystem = false) {
            const msgDiv = document.createElement('div');
            msgDiv.className = `flex flex-col ${isSystem ? 'opacity-80' : ''}`;
            
            const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' });
            
            msgDiv.innerHTML = `
                <div class="flex gap-2 text-xs">
                    <span class="text-gray-500">[${timestamp}]</span>
                    <span class="${isSystem ? 'text-yellow-500' : 'text-blue-400'} font-bold">${user}:</span>
                    <span class="text-green-300">${text}</span>
                </div>
            `;
            chatWindow.appendChild(msgDiv);
            chatWindow.scrollTop = chatWindow.scrollHeight;
        }

        async function loadMessages() {
            try {
                const res = await fetch('/api/messages');
                const messages = await res.json();
                messages.forEach(msg => {
                    appendMessage(msg.username, msg.text, msg.isSystem);
                });
            } catch (e) {
                console.error("Failed to load messages:", e);
            }
        }

        async function sendMessage(text) {
            const userData = JSON.parse(localStorage.getItem('terminal_user') || '{"username": "GUEST"}');
            
            try {
                const response = await fetch('/api/messages', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: userData.username,
                        text: text,
                        role: "User"
                    })
                });

                if (response.ok) {
                    appendMessage(userData.username, text);
                }
            } catch (err) {
                appendMessage("SYSTEM", "Failed to transmit data packet.", true);
            }
        }

        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && commandInput.value.trim() !== "") {
                const val = commandInput.value;
                commandInput.value = "";
                
                // Simple command handler
                if (val.startsWith('/')) {
                    handleCommand(val);
                } else {
                    sendMessage(val);
                }
            }
        });

        function handleCommand(cmd) {
            const c = cmd.toLowerCase();
            if (c === '/clear') chatWindow.innerHTML = "";
            else if (c === '/help') appendMessage("SYSTEM", "Available: /clear, /help, /whoami", true);
            else appendMessage("SYSTEM", `Unknown command: ${cmd}`, true);
        }

        // Initialize
        window.onload = checkConnection;
    </script>
</body>
</html>
