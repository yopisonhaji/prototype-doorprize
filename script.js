const app = {
    // STATE
    state: {
        participants: [], // { name: string, number: string }
        winnerSetting: null, // string (target number)
        currentPage: 1,
        itemsPerPage: 10,
        isSpinning: false,
        wheelContext: null,
        wheelAngle: 0,
        spinSpeed: 0,
    },

    // CONSTANTS
    STORAGE_KEY: "doorprize_participants",
    SETTING_KEY: "doorprize_winner_setting",

    init: () => {
        app.loadData();
        app.initCanvas();
        app.renderTable();

        // Drag & Drop
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-excel');

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', app.handleFileSelect);

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', app.handleDrop);

        // LEVER EVENTS
        app.updateLeverVisual();
        document.addEventListener('mouseup', app.stopDragLever);
        document.addEventListener('mousemove', app.dragLever);
        document.addEventListener('touchend', app.stopDragLever);
        document.addEventListener('touchmove', app.dragLever);
    },

    // NAVIGATION
    navTo: (screenId) => {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

        const target = document.getElementById(screenId);
        target.classList.remove('hidden');
        setTimeout(() => target.classList.add('active'), 10); // Fade in

        if (screenId === 'screen-list') app.renderTable();
        if (screenId === 'screen-spin') {
            app.ensureCanvasSize();
            app.drawWheel();
        }
        if (screenId === 'screen-setting') app.loadSetting();
    },

    // DATA HANDLING
    loadData: () => {
        const stored = localStorage.getItem(app.STORAGE_KEY);
        if (stored) {
            app.state.participants = JSON.parse(stored);
        }
        document.getElementById('total-participants').innerText = app.state.participants.length;
    },

    saveData: () => {
        localStorage.setItem(app.STORAGE_KEY, JSON.stringify(app.state.participants));
        document.getElementById('total-participants').innerText = app.state.participants.length;
    },

    clearAllData: () => {
        if (confirm("YAKIN HAPUS SEMUA DATA? Data tidak bisa dikembalikan!")) {
            app.state.participants = [];
            app.saveData();
            app.renderTable();
            alert("Data dihapus bersih!");
        }
    },

    // INPUT MANUAL
    handleManualSubmit: (e) => {
        e.preventDefault();
        const name = document.getElementById('input-name').value;
        const number = document.getElementById('input-number').value;

        // Validation for uniqueness (Check number)
        if (app.state.participants.some(p => p.number === number)) {
            alert(`Nomor ${number} sudah ada!`);
            return;
        }

        app.state.participants.push({ name, number });
        app.saveData();

        e.target.reset();
        alert("Peserta Ditambahkan!");
    },

    // EXCEL IMPORT
    handleDrop: (e) => {
        e.preventDefault();
        document.getElementById('drop-zone').classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) app.processExcel(files[0]);
    },

    handleFileUpload: (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const data = new Uint8Array(evt.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }); // Read as Array of Arrays first

            if (jsonData.length < 2) {
                document.getElementById('import-status').innerText = "❌ File kosong atau format salah!";
                return;
            }

            // SMART COLUMN DETECTION
            const headers = jsonData[0].map(h => String(h).toLowerCase().trim());
            const nameIdx = headers.findIndex(h => h.includes('nama') || h.includes('name') || h === 'peserta');
            const numIdx = headers.findIndex(h => h.includes('nomor') || h.includes('no') || h.includes('number') || h.includes('undian') || h === 'id' || h === 'nim');

            if (nameIdx === -1) {
                alert("❌ Kolom 'NAMA' tidak ditemukan di Excel!\nPastikan ada header: 'Nama', 'Name', atau 'Peserta'");
                return;
            }

            // Generate Number automatically if not found? No, better warn. 
            // Actually, if simply 'No' is not found, maybe use row index? 
            // Let's strict warn for now but allow fallback if needed.

            let count = 0;
            // Iterate from row 1 (skip header)
            for (let i = 1; i < jsonData.length; i++) {
                const row = jsonData[i];
                if (!row || row.length === 0) continue;

                const rawName = row[nameIdx];
                // If number column exists use it, else generic ID
                const rawNum = numIdx !== -1 ? row[numIdx] : null;

                if (rawName) {
                    // Check duplicate
                    if (!app.state.participants.some(p => String(p.number) == String(rawNum))) {
                        app.state.participants.push({
                            id: Date.now() + Math.random(),
                            name: String(rawName).trim(),
                            number: rawNum ? String(rawNum).trim() : `AUTO-${app.state.participants.length + 1}`
                        });
                        count++;
                    }
                }
            }

            app.saveData();
            app.renderTable();
            document.getElementById('import-status').innerText = `✅ Berhasil import ${count} data!`;

            // Auto navigate to list to show proof
            setTimeout(() => app.navTo('screen-list'), 1000);
        };
        reader.readAsArrayBuffer(file);
    },

    // This function is now deprecated, handleFileUpload replaces its logic
    processExcel: (file) => {
        // This function is kept for handleDrop compatibility, but its logic is now in handleFileUpload
        // For simplicity, we'll just call handleFileUpload with a compatible event object
        app.handleFileUpload({ target: { files: [file] } });
    },

    // LIST VIEW
    renderTable: () => {
        const tbody = document.getElementById('participants-body');
        tbody.innerHTML = '';

        const start = (app.state.currentPage - 1) * app.state.itemsPerPage;
        const end = start + app.state.itemsPerPage;
        const pageData = app.state.participants.slice(start, end);

        pageData.forEach((p, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${start + index + 1}</td>
                <td>${p.name}</td>
                <td>${p.number}</td>
                <td><button onclick="app.deleteOne('${p.number}')">❌</button></td>
            `;
            tbody.appendChild(tr);
        });

        document.getElementById('page-indicator').innerText = `Page ${app.state.currentPage} of ${Math.ceil(app.state.participants.length / app.state.itemsPerPage) || 1}`;
    },

    nextPage: () => {
        const maxPage = Math.ceil(app.state.participants.length / app.state.itemsPerPage);
        if (app.state.currentPage < maxPage) {
            app.state.currentPage++;
            app.renderTable();
        }
    },

    prevPage: () => {
        if (app.state.currentPage > 1) {
            app.state.currentPage--;
            app.renderTable();
        }
    },

    deleteOne: (num) => {
        if (confirm("Hapus peserta ini?")) {
            app.state.participants = app.state.participants.filter(p => p.number !== num);
            app.saveData();
            app.renderTable();
        }
    },

    // SETTING WINNER
    loadSetting: () => {
        const stored = localStorage.getItem(app.SETTING_KEY);
        if (stored) {
            // Display as comma joined string for easy editing
            try {
                const queue = JSON.parse(stored);
                document.getElementById('setting-winner-input').value = queue.join('\n');
                app.renderQueuePreview(queue);
            } catch (e) {
                // Legacy support or error
                document.getElementById('setting-winner-input').value = stored;
            }
        }
    },

    saveWinnerSetting: () => {
        const val = document.getElementById('setting-winner-input').value;
        // Parse: Split by comma or newline, trim, remove empty
        const queue = val.split(/[\n,]+/).map(s => s.trim()).filter(s => s !== "");

        localStorage.setItem(app.SETTING_KEY, JSON.stringify(queue));
        app.state.winnerSetting = queue; // Update state

        app.renderQueuePreview(queue);
        document.getElementById('setting-status').innerText = `Tersimpan! ${queue.length} Pemenang dalam antrian.`;
    },

    renderQueuePreview: (queue) => {
        const previewEl = document.getElementById('winner-queue-preview');
        if (queue.length === 0) {
            previewEl.innerHTML = "<em>Belum ada antrian pemenang.</em>";
            return;
        }
        let html = "<strong>URUTAN PEMENANG BERIKUTNYA:</strong><br>";
        queue.forEach((num, idx) => {
            html += `${idx + 1}. Nomor ${num}<br>`;
        });
        previewEl.innerHTML = html;
    },

    // SPIN WHEEL LOGIC
    initCanvas: () => {
        const canvas = document.getElementById('wheel-canvas');
        app.state.wheelContext = canvas.getContext('2d');
    },

    ensureCanvasSize: () => {
        const canvas = document.getElementById('wheel-canvas');
        if (canvas.width === 0 || canvas.width === 300) { // Default is often 300x150
            const dpr = window.devicePixelRatio || 1;
            // We need to force a layout calc if it was hidden. 
            // Since we just removed 'hidden' in navTo, it should have a rect now using CSS size (500px or 600px)
            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                app.state.wheelContext.setTransform(1, 0, 0, 1, 0, 0); // Reset
                app.state.wheelContext.scale(dpr, dpr);
            }
        }
    },

    drawWheel: (angleOffset = 0) => {
        const ctx = app.state.wheelContext;
        const canvas = document.getElementById('wheel-canvas');
        // Reset transform to handle high DPI properly handled by scale above
        // We need logical width/height
        const width = canvas.width / (window.devicePixelRatio || 1);
        const height = canvas.height / (window.devicePixelRatio || 1);
        const cx = width / 2;
        const cy = height / 2;
        const radius = width / 2 - 25; // Leave room for border

        ctx.clearRect(0, 0, width, height);

        const participants = app.state.participants;
        const total = participants.length;

        if (total === 0) {
            ctx.fillStyle = "#111";
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#aa8833"; ctx.textAlign = "center"; ctx.font = "20px Cinzel"; ctx.fillText("NO DATA", cx, cy);
            return;
        }

        const step = (2 * Math.PI) / total;

        // Luxury Palette
        const palette = [
            '#0a0a0a', // Onyx
            '#1f1f1f', // Dark Grey
            '#2e2410', // Dark Gold
            '#141414'
        ];

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angleOffset);

        const detailed = total < 200;

        for (let i = 0; i < total; i++) {
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, radius, i * step, (i + 1) * step);

            // 3D Cylinder Effect using Gradient
            // We rotate the gradient with the slice? No, radial or linear relative to slice.
            // Simple approach: Use color but overlay a "shine"

            ctx.fillStyle = palette[i % palette.length];
            ctx.fill();

            // Gold Separator
            if (detailed || total < 500) {
                ctx.strokeStyle = "#7a5c18";
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            // Text
            if (detailed) {
                ctx.save();
                ctx.rotate(i * step + step / 2);
                ctx.fillStyle = "#f5d67b"; // Gold Light
                ctx.font = total > 50 ? "bold 10px Inter" : "bold 14px Cinzel";
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                ctx.shadowColor = "black";
                ctx.shadowBlur = 4;
                ctx.fillText(participants[i].number, radius - 15, 0);
                ctx.restore();
            }
        }

        // INNER SHADOW / GLOSS OVERLAY
        ctx.restore(); // Back to normal coords

        // Simulate glass reflection
        ctx.save();
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(1, "rgba(0,0,0,0.4)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },

    // LEVER LOGIC
    isDraggingLever: false,

    startDragLever: (e) => {
        app.isDraggingLever = true;
        app.dragLever(e); // Snap immediately
    },

    stopDragLever: () => {
        app.isDraggingLever = false;
    },

    dragLever: (e) => {
        if (!app.isDraggingLever) return;

        const track = document.querySelector('.lever-track');
        if (!track) return;

        const rect = track.getBoundingClientRect();
        let clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Calculate percentage from bottom (Bottom = 0 power, Top = 1 power)
        let val = (rect.bottom - clientY) / rect.height;

        // Clamp
        val = Math.max(0, Math.min(1, val));

        app.state.spinPower = val;
        app.updateLeverVisual();
    },

    updateLeverVisual: () => {
        const fill = document.getElementById('lever-fill');
        const handle = document.getElementById('lever-handle');
        if (!fill || !handle) return;

        fill.style.height = (app.state.spinPower * 100) + '%';
        handle.style.bottom = (app.state.spinPower * 100) + '%';
    },

    startSpin: () => {
        if (app.state.participants.length === 0) {
            alert("Belum ada peserta!");
            return;
        }
        if (app.state.isSpinning) return;

        // LOAD SETTINGS
        let winnerQueue = [];
        try {
            const stored = localStorage.getItem(app.SETTING_KEY);
            if (stored) winnerQueue = JSON.parse(stored);
        } catch (e) { console.log("No queue settings"); }

        // DETERMINATION LOGIC
        let winner;
        let targetIndex;
        let forcedNumber = null;

        if (Array.isArray(winnerQueue) && winnerQueue.length > 0) {
            forcedNumber = String(winnerQueue[0]).trim(); // Normalize strict

            // Strict Compare
            const foundIndex = app.state.participants.findIndex(p => String(p.number).trim() === forcedNumber);

            if (foundIndex !== -1) {
                winner = app.state.participants[foundIndex];
                targetIndex = foundIndex;

                // Update Queue (Pop the used winner)
                winnerQueue.shift();
                localStorage.setItem(app.SETTING_KEY, JSON.stringify(winnerQueue));

                // Also update the UI list if open
                if (document.getElementById('setting-winner-input')) {
                    document.getElementById('setting-winner-input').value = winnerQueue.join('\n');
                    app.renderQueuePreview(winnerQueue);
                }

            } else {
                // FALLBACK TO RANDOM (SILENT)
                console.log(`Settingan nomor ${forcedNumber} tidak ditemukan. Mengacak random.`);
            }
        }

        if (!winner) {
            // Random Fallback
            targetIndex = Math.floor(Math.random() * app.state.participants.length);
            winner = app.state.participants[targetIndex];
        }

        // CALCULATE STOP ANGLE
        const total = app.state.participants.length;
        const step = (2 * Math.PI) / total;
        // winning angle relative to wheel start 0:
        const winAngleStart = targetIndex * step;
        const winAngleCenter = winAngleStart + step / 2;

        // Target is - PI/2 (Top)
        const targetRotationBase = -Math.PI / 2 - winAngleCenter;

        // CALCULATE DURATION & SPINS BASED ON LEVER
        // Power 0.0 -> 5s, 5 spins
        // Power 1.0 -> 15s, 30 spins

        let power = app.state.spinPower || 0.5; // Default if undefined
        const spins = 5 + (power * 25) + Math.random() * 2;
        const duration = 4000 + (power * 8000);

        // PREPARE SPIN
        app.state.isSpinning = true;
        document.getElementById('spin-btn').classList.add('hidden');
        document.getElementById('reset-spin-btn').classList.add('hidden');
        document.getElementById('winner-display').style.opacity = '0';
        document.getElementById('winner-display').classList.remove('active');

        const startTimestamp = performance.now();
        const startAngle = app.state.wheelAngle || 0;

        // CALCULATE FINAL ANGLE
        // We want final angle = targetRotationBase (mod 2PI)
        // But we want to add 'spins' full rotations.

        // Current Phase
        let currentPhase = startAngle % (2 * Math.PI);
        if (currentPhase < 0) currentPhase += 2 * Math.PI;

        // Target Phase
        let targetPhase = targetRotationBase % (2 * Math.PI);
        if (targetPhase < 0) targetPhase += 2 * Math.PI;

        // Delta to reach target forward
        let delta = targetPhase - currentPhase;
        if (delta < 0) delta += 2 * Math.PI;

        // Add full spins
        const totalRotation = delta + (Math.floor(spins) * 2 * Math.PI);

        const output = (t) => {
            // Cubic Ease Out
            return (--t) * t * t + 1;
        };

        const animate = (time) => {
            const elapsed = time - startTimestamp;
            if (elapsed >= duration) {
                app.state.wheelAngle = (startAngle + totalRotation) % (2 * Math.PI);
                app.drawWheel(app.state.wheelAngle);
                app.finishSpin(winner);
                return;
            }

            const progress = elapsed / duration;
            const ease = output(progress);

            const current = startAngle + (totalRotation * ease);
            app.state.wheelAngle = current;
            app.drawWheel(current);
            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    },

    finishSpin: (winner) => {
        app.state.isSpinning = false;

        // Show Winner
        const winDisplay = document.getElementById('winner-display');
        const winName = document.getElementById('win-name');
        const winNum = document.getElementById('win-number');

        winName.innerText = winner.name;
        winNum.innerText = winner.number;

        winDisplay.style.opacity = '1';
        winDisplay.classList.add('active'); // Pop effect

        // Confetti EXTREME
        const duration = 5000;
        const end = Date.now() + duration;

        (function frame() {
            // Left Cannon
            confetti({
                particleCount: 10,
                angle: 60,
                spread: 70,
                origin: { x: 0 },
                colors: ['#ffd700', '#ffffff', '#ff0000', '#ff00de'] // Gold, White, Red, Pink
            });
            // Right Cannon
            confetti({
                particleCount: 10,
                angle: 120,
                spread: 70,
                origin: { x: 1 },
                colors: ['#ffd700', '#ffffff', '#ff0000', '#ff00de']
            });
            // Center Explosion (Randomly)
            if (Math.random() > 0.7) {
                confetti({
                    particleCount: 15,
                    spread: 360,
                    startVelocity: 30,
                    origin: { x: Math.random(), y: Math.random() - 0.2 },
                    colors: ['#ffd700']
                });
            }

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());

        document.getElementById('reset-spin-btn').classList.remove('hidden');

        // TRIGGER PARTY MODE
        document.querySelectorAll('.mascot').forEach(el => el.classList.add('party'));
    },

    // AUTO SCALING (FIT TO SCREEN)
    handleResize: () => {
        const stage = document.querySelector('.app-container');
        const targetW = 1920;
        const targetH = 1080;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const scale = Math.min(winW / targetW, winH / targetH);

        // Apply scale, keeping it centered
        stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    },

    // MASCOT AI (Wandering Logic)
    initMascots: () => {
        const mascots = document.querySelectorAll('.mascot');
        mascots.forEach(el => {
            // Give them random starting positions within 1920x1080 space
            el.x = Math.random() * 1800;
            el.y = Math.random() * 900;
            el.vx = (Math.random() - 0.5) * 4; // Faster speed
            el.vy = (Math.random() - 0.5) * 4;

            // Set initial inline styles AND CLEAR CONFLICTS
            el.style.left = el.x + 'px';
            el.style.top = el.y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });

        const animateMascots = () => {
            mascots.forEach(el => {
                if (el.classList.contains('party')) return;

                // Bounds are now the Stage Size (1920x1080), not window
                const parentW = 1920;
                const parentH = 1080;
                const size = 100; // approx sprite size

                // Update Pos
                el.x += el.vx;
                el.y += el.vy;

                // Bounce Logic
                if (el.x <= 0 || el.x + size >= parentW) el.vx *= -1;
                if (el.y <= 0 || el.y + size >= parentH) el.vy *= -1;

                // Clamp to be safe
                el.x = Math.max(0, Math.min(el.x, parentW - size));
                el.y = Math.max(0, Math.min(el.y, parentH - size));

                el.style.left = el.x + 'px';
                el.style.top = el.y + 'px';
            });
            requestAnimationFrame(animateMascots);
        };
        requestAnimationFrame(animateMascots);
    },

    resetSpin: () => {
        document.getElementById('winner-display').style.opacity = '0';
        document.getElementById('winner-display').classList.remove('active'); // Remove pop class
        document.getElementById('spin-btn').classList.remove('hidden');
        document.getElementById('reset-spin-btn').classList.add('hidden'); // Fix button chaos
        // Clear previous winner
        document.getElementById('win-name').innerText = "???";
        document.getElementById('win-number').innerText = "000";

        // STOP PARTY MODE
        document.querySelectorAll('.mascot').forEach(el => el.classList.remove('party'));
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    app.initMascots();
    app.handleResize();
    window.addEventListener('resize', app.handleResize);
});
