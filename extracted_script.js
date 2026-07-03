
        // ================================================================
        // CHART.JS GLOBAL CONFIGURATION
        // ================================================================
        if (typeof Chart !== 'undefined') {
            Chart.defaults.font.family = "'Outfit', sans-serif";
            Chart.defaults.color = '#94a3b8';
            Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 23, 42, 0.85)';
            Chart.defaults.plugins.tooltip.titleColor = '#f8fafc';
            Chart.defaults.plugins.tooltip.bodyColor = '#f8fafc';
            Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.08)';
            Chart.defaults.plugins.tooltip.borderWidth = 1;
            Chart.defaults.plugins.tooltip.padding = 10;
            Chart.defaults.plugins.tooltip.cornerRadius = 8;
            Chart.defaults.plugins.tooltip.displayColors = true;
        }

        // ================================================================
        // CONFIGURAZIONE AI
        // ================================================================
        const GEMINI_MODEL = "gemini-2.5-flash";

        // ================================================================
        // STATO GLOBALE
        // ================================================================
        let trendView = 'giorni'; // 'giorni' o 'settimane'
        let ultimaAnalisi = null;
        let editingId = null; // ID entry in modifica
        let editingGiornoId = null; // ID giorno per modifica peso

        let trendCalorieChart = null;
        let trendPesoChart = null;

        let weekCalorieChart = null;
        let weekPesoChart = null;

        let monthCalorieChart = null;
        let monthPesoChart = null;

        let gaugeCalorieChart = null;
        let gaugeProteineChart = null;
        let gaugeCarboChart = null;
        let gaugeGrassiChart = null;

        let targetCalorie = 0; // Target giornaliero calorie
        let targetProteine = 0; // Target giornaliero proteine
        let targetCarbo = 0; // Target giornaliero carboidrati
        let targetGrassi = 0; // Target giornaliero grassi
        let pesoTarget = 75; // Legge il valore salvato, altrimenti usa 75

        // Funzione helper per calcolare limiti (min e max) e stepSize per gli assi Y in modo coerente
        function calcolaLimitiAsseY(minVal, maxVal, isCalorie) {
            if (isCalorie) {
                const step = 500;
                // Arrotonda il massimo al multiplo di 500 immediatamente superiore
                const yMax = Math.ceil((maxVal || 1) / step) * step;
                return { min: 0, max: yMax, stepSize: step };
            } else {
                // Peso
                const diff = maxVal - minVal;
                let step = 1;
                if (diff <= 5) step = 1;
                else if (diff <= 12) step = 2;
                else if (diff <= 30) step = 5;
                else step = 10;

                // Margine minimo di sicurezza per evitare che i grafici tocchino i bordi
                const adjustedMin = minVal - 0.5;
                const adjustedMax = maxVal + 0.5;

                const yMin = Math.floor(adjustedMin / step) * step;
                const yMax = Math.ceil(adjustedMax / step) * step;

                return { min: yMin, max: yMax, stepSize: step };
            }
        }

        // Plugin per disegnare i semafori dei target macro sopra le barre delle calorie
        const macroStatusLightsPlugin = {
            id: 'macroStatusLights',
            afterDatasetsDraw(chart) {
                const { ctx, scales: { x, y } } = chart;
                const rawData = chart.config.data.customRawData;
                const targets = chart.config.data.customTargets;
                if (!rawData || !targets) return;

                // Trova il dataset delle bar (Grassi, prima barra, index 0)
                const barMeta = chart.getDatasetMeta(0);
                if (!barMeta || barMeta.hidden) return;

                rawData.forEach((item, index) => {
                    const totalCalories = item.calorie || 0;
                    if (totalCalories <= 0) return;

                    const xPos = barMeta.data[index]?.x;
                    if (xPos === undefined) return;

                    const pctProt = targets.proteine > 0 ? ((item.proteine || 0) / targets.proteine) * 100 : 0;
                    const pctCarb = targets.carboidrati > 0 ? ((item.carboidrati || 0) / targets.carboidrati) * 100 : 0;
                    const pctFat = targets.grassi > 0 ? ((item.grassi || 0) / targets.grassi) * 100 : 0;

                    const fatCal = Math.round((item.grassi || 0) * 9);
                    const carbCal = Math.round((item.carboidrati || 0) * 4);
                    const protCal = Math.round((item.proteine || 0) * 4);

                    const yZero = y.getPixelForValue(0);
                    const yFatsTop = y.getPixelForValue(fatCal);
                    const yCarbsTop = y.getPixelForValue(fatCal + carbCal);
                    const yProtsTop = y.getPixelForValue(fatCal + carbCal + protCal);

                    const badges = [];
                    // Aggiungiamo i badge solo se lo spessore del segmento è sufficiente (es. >= 8px)
                    if (Math.abs(yZero - yFatsTop) >= 8) {
                        badges.push({ val: pctFat, y: (yZero + yFatsTop) / 2 });
                    }
                    if (Math.abs(yFatsTop - yCarbsTop) >= 8) {
                        badges.push({ val: pctCarb, y: (yFatsTop + yCarbsTop) / 2 });
                    }
                    if (Math.abs(yCarbsTop - yProtsTop) >= 8) {
                        badges.push({ val: pctProt, y: (yCarbsTop + yProtsTop) / 2 });
                    }

                    badges.forEach((badge) => {
                        let color = '#3b82f6'; // Sotto target (Blu/Azzurro)
                        let icon = '▼';
                        if (badge.val >= 90 && badge.val <= 110) {
                            color = '#10b981'; // On target (Verde)
                            icon = '✔';
                        } else if (badge.val > 110) {
                            color = '#ef4444'; // Sopra target (Rosso)
                            icon = '▲';
                        }

                        const text = Math.round(badge.val) + '%' + (icon ? ' ' + icon : '');

                        ctx.save();
                        ctx.font = "bold 8.5px 'Outfit', sans-serif";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';

                        // Bordo bianco per risaltare sul segmento (con outline stroke)
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3;
                        ctx.lineJoin = 'round';
                        ctx.strokeText(text, xPos, badge.y);

                        // Testo colorato sopra
                        ctx.fillStyle = color;
                        ctx.fillText(text, xPos, badge.y);

                        ctx.restore();
                    });
                });
            }
        };

        // ================================================================
        // TEMA (CHIARO / SCURO)
        // ================================================================
        window.applicaTema = function (tema) {
            const body = document.body;
            const themeIcon = document.getElementById('themeIcon');
            if (tema === 'light') {
                body.classList.add('light-theme');
                if (themeIcon) {
                    themeIcon.setAttribute('data-lucide', 'moon');
                }
            } else {
                body.classList.remove('light-theme');
                if (themeIcon) {
                    themeIcon.setAttribute('data-lucide', 'sun');
                }
            }
            localStorage.setItem('app_theme', tema);
            if (typeof Chart !== 'undefined') {
                Chart.defaults.color = tema === 'light' ? '#475569' : '#94a3b8';
            }
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Rinfresca tutti i grafici per riflettere le nuove impostazioni colore dei font e assi
            if (typeof aggiornaTotaleGiorno === 'function') aggiornaTotaleGiorno();
            if (typeof renderTrend === 'function') {
                if (typeof trendView !== 'undefined' && trendView === 'mesi') {
                    if (typeof renderTrendMensile === 'function') renderTrendMensile();
                } else {
                    if (typeof renderTrend === 'function') renderTrend();
                }
            }
        };

        window.toggleTheme = function () {
            const currentTheme = localStorage.getItem('app_theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            window.applicaTema(newTheme);
        };

        // ================================================================
        // FILE SYSTEM BACKUP & AUTO-SAVE (File System Access API)
        // ================================================================
        const DB_NAME = 'FitFileStore';
        const STORE_NAME = 'handles';

        function getIndexedDB() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = (e) => {
                    e.target.result.createObjectStore(STORE_NAME);
                };
                request.onsuccess = (e) => resolve(e.target.result);
                request.onerror = (e) => reject(e.target.error);
            });
        }

        async function saveFileHandle(handle) {
            const db = await getIndexedDB();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                const store = tx.objectStore(STORE_NAME);
                const request = store.put(handle, 'autoSaveFile');
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }

        async function getFileHandle() {
            try {
                const db = await getIndexedDB();
                return new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readonly');
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.get('autoSaveFile');
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            } catch (err) {
                console.error("IndexedDB error:", err);
                return null;
            }
        }

        window.selezionaFileAutoSalvataggio = async function () {
            if (!('showSaveFilePicker' in window)) {
                await customAlert(
                    currentLang === 'en' ? "Not Supported" : "Non supportato",
                    currentLang === 'en'
                        ? "Direct local file saving is not supported by iOS/Mobile Safari. Your data is still safely auto-saved in the browser's memory! Use the manual 'Export data' button to download backups."
                        : "L'auto-salvataggio diretto su file non è supportato da iOS/Safari Mobile. I tuoi dati sono comunque salvati in sicurezza nella memoria locale del browser! Usa il pulsante 'Esporta dati' per scaricare i backup."
                );
                return;
            }

            try {
                const options = {
                    suggestedName: 'fit_database.json',
                    types: [{
                        description: 'JSON Files',
                        accept: {
                            'application/json': ['.json'],
                        },
                    }],
                };
                const handle = await window.showSaveFilePicker(options);
                await saveFileHandle(handle);
                await aggiornaStatoFileAuto();
                
                // Salva immediatamente i dati esistenti nel file associato
                await autoSalvaNelFileLocale();

                await customAlert("File associato", currentLang === 'en'
                    ? "The file has been successfully associated. Your data will be auto-saved here on every action!"
                    : "File associato correttamente! I dati verranno salvati qui automaticamente ad ogni inserimento o modifica.", true);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error("Errore selezione file:", err);
                }
            }
        }

        window.rimuoviFileAutoSalvataggio = async function () {
            try {
                const db = await getIndexedDB();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    const request = store.delete('autoSaveFile');
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
                await aggiornaStatoFileAuto();
                await customAlert("Associazione rimossa", currentLang === 'en'
                    ? "Auto-save file link has been removed."
                    : "Associazione con il file di auto-salvataggio rimossa.", true);
            } catch (err) {
                console.error("Errore durante la rimozione dell'associazione:", err);
            }
        }

        window.aggiornaStatoFileAuto = async function () {
            const handle = await getFileHandle();
            const lbl = document.getElementById('lblFileAutoSalvataggio');
            const pathInfo = document.getElementById('pathFileAutoSalvataggio');
            const btnRimuovi = document.getElementById('btnRimuoviFileAuto');
            const btnSelect = lbl ? lbl.closest('button') : null;

            if (!lbl || !pathInfo) return;

            if (!('showSaveFilePicker' in window)) {
                // Non supportato (iOS/Mobile Safari)
                lbl.innerText = currentLang === 'en' ? "Auto-Save Not Supported" : "Auto-Salvataggio Non Supportato";
                if (btnSelect) {
                    btnSelect.disabled = true;
                    btnSelect.style.opacity = "0.5";
                    btnSelect.style.cursor = "not-allowed";
                }
                pathInfo.className = "text-[10px] text-amber-500/90 font-medium leading-relaxed mt-1";
                pathInfo.innerText = currentLang === 'en'
                    ? "Direct local file saving is not supported by iOS/Mobile Safari. Your data is still safely auto-saved in the browser's memory! Use the manual 'Export data' button below to download backups."
                    : "La scrittura diretta su file locali non è supportata da iOS/Safari Mobile. I tuoi dati sono comunque salvati in sicurezza nella memoria locale del browser! Usa il pulsante 'Esporta dati' in basso per scaricare i backup.";
                if (btnRimuovi) btnRimuovi.classList.add('hidden');
                return;
            }

            // Resetta lo stile se supportato
            if (btnSelect) {
                btnSelect.disabled = false;
                btnSelect.style.opacity = "1";
                btnSelect.style.cursor = "pointer";
            }
            pathInfo.className = "text-[10px] text-slate-500 italic break-all";

            if (handle) {
                lbl.innerText = currentLang === 'en' ? "Change file link" : "Cambia file associato";
                pathInfo.innerText = (currentLang === 'en' ? "Auto-saving to: " : "Salvataggio automatico su: ") + handle.name;
                if (btnRimuovi) btnRimuovi.classList.remove('hidden');
            } else {
                lbl.innerText = currentLang === 'en' ? "Link database file" : "Associa file database";
                pathInfo.innerText = currentLang === 'en' ? "No local file linked (data stored in browser only)" : "Nessun file locale associato (salvataggio solo in memoria browser)";
                if (btnRimuovi) btnRimuovi.classList.add('hidden');
            }
        }

        window.ottieniStatoCompletoDB = function () {
            const dbRaw = localStorage.getItem('nutriDB');
            const diario = JSON.parse(dbRaw || '[]');
            
            const impostazioni = {
                target_calorie: localStorage.getItem('target_calorie'),
                target_proteine: localStorage.getItem('target_proteine'),
                target_carbo: localStorage.getItem('target_carbo'),
                target_grassi: localStorage.getItem('target_grassi'),
                targetPeso: localStorage.getItem('targetPeso'),
                profile_peso: localStorage.getItem('profile_peso'),
                profile_altezza: localStorage.getItem('profile_altezza'),
                profile_attivita: localStorage.getItem('profile_attivita'),
                profile_obiettivo: localStorage.getItem('profile_obiettivo'),
                profile_peso_target: localStorage.getItem('profile_peso_target'),
                profile_sesso: localStorage.getItem('profile_sesso'),
                profile_eta: localStorage.getItem('profile_eta')
            };

            return {
                versione: 2,
                diario: diario,
                impostazioni: impostazioni
            };
        };

        window.autoSalvaNelFileLocale = async function () {
            try {
                const handle = await getFileHandle();
                if (!handle) return;

                const options = { mode: 'readwrite' };
                if ((await handle.queryPermission(options)) !== 'granted') {
                    const status = await handle.requestPermission(options);
                    if (status !== 'granted') {
                        console.warn("Permesso di scrittura negato per il file locale.");
                        return;
                    }
                }

                const parsed = ottieniStatoCompletoDB();
                const formattedJson = JSON.stringify(parsed, null, 2);

                const writable = await handle.createWritable();
                await writable.write(formattedJson);
                await writable.close();
                console.log("Database salvato con successo nel file locale.");
            } catch (err) {
                console.error("Errore durante l'auto-salvataggio:", err);
            }
        };

        window.salvaDatabase = function (db) {
            localStorage.setItem('nutriDB', JSON.stringify(db));
            autoSalvaNelFileLocale();
        };

        window.saveProfileData = function () {
            const peso = document.getElementById('aiPeso')?.value.trim();
            const altezza = document.getElementById('aiAltezza')?.value.trim();
            const attivita = document.getElementById('aiAttivita')?.value.trim();
            const obiettivo = document.getElementById('aiObiettivo')?.value.trim();
            const pesoTargetInput = document.getElementById('aiPesoTarget')?.value.trim();
            const sesso = document.getElementById('aiSesso')?.value;
            const eta = document.getElementById('aiEta')?.value.trim();

            if (peso) localStorage.setItem('profile_peso', peso);
            if (altezza) localStorage.setItem('profile_altezza', altezza);
            if (attivita) localStorage.setItem('profile_attivita', attivita);
            if (obiettivo) localStorage.setItem('profile_obiettivo', obiettivo);
            if (pesoTargetInput) localStorage.setItem('profile_peso_target', pesoTargetInput);
            if (sesso) localStorage.setItem('profile_sesso', sesso);
            if (eta) localStorage.setItem('profile_eta', eta);

            autoSalvaNelFileLocale();
        };

        window.ottieniProfiloUtente = function () {
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const giorniConPeso = db.filter(g => g.peso).sort((a, b) => new Date(b.data) - new Date(a.data));
            
            let pesoCorrente = localStorage.getItem('profile_peso') || "";
            if (giorniConPeso.length > 0) {
                pesoCorrente = giorniConPeso[0].peso;
            } else if (!pesoCorrente) {
                pesoCorrente = localStorage.getItem('targetPeso') || "75";
            }

            const altezza = localStorage.getItem('profile_altezza') || "";
            const targetCalorieVal = localStorage.getItem('target_calorie') || "2000";
            const sesso = localStorage.getItem('profile_sesso') || "uomo";
            const eta = localStorage.getItem('profile_eta') || "";

            return {
                peso: pesoCorrente,
                altezza: altezza,
                targetCalorie: targetCalorieVal,
                sesso: sesso,
                eta: eta
            };
        };

        // Chart.js donut
        const ctx = document.getElementById('macroChart').getContext('2d');
        let macroChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Proteine', 'Carboidrati', 'Grassi'],
                datasets: [{
                    data: [0, 0, 0],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return context.formattedValue;
                            }
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: true
            }
        });

        lucide.createIcons();

        // ================================================================
        // LOCALIZZAZIONE / DICTIONARY i18n
        // ================================================================
        const TRANSLATIONS = {
            it: {
                title_api_settings: "Impostazioni",
                title_macronutrienti: "Macronutrienti",
                title_peso_calorie: "Peso & Calorie",
                label_api_key: "Gemini API Key",
                label_language: "Lingua / Language",
                label_daily_targets: "Target giornalieri",
                label_calorie: "Calorie",
                label_peso: "Target Peso",
                label_proteine: "Proteine",
                label_carboidrati: "Carboidrati",
                label_grassi: "Grassi",
                btn_calculate_ai: "Calcola target con AI",
                tab_oggi: "Dati",
                tab_trend: "Trend",
                tab_storico: "Registro",
                label_body_weight: "Registrazione Peso Corporeo",
                btn_save_weight: "Salva Peso",
                btn_ask_ai_opinion: "Elabora con AI",
                btn_ask_ai_trend: "Chiedi parere ad AI sull'andamento",
                trend_title_days: "Andamento ultimi 7 giorni",
                trend_title_weeks: "Andamento ultime 8 settimane (Media/Giorno)",
                trend_title_months: "Registro Mensile (Dall'inizio)",
                placeholder_input_pasto: "Es: Stamattina yogurt greco...",
                placeholder_weight_input: "es. 74.5",
                prompt_what_did_you_eat: "Cosa hai mangiato?",
                label_date: "Data",
                label_date_colon: "Data:",
                label_calorie_uppercase: "CALORIE",
                label_proteine_uppercase: "PROTEINE",
                label_carboidrati_uppercase: "CARBOIDRATI",
                label_carbo_uppercase: "CARBO",
                label_grassi_uppercase: "GRASSI",
                label_peso_kg: "Peso (kg)",
                title_totale_oggi: "Totale di oggi",
                btn_ask_ai_opinion_short: "Chiedi parere AI",
                lbl_ai_analyzing_meals: "L'AI sta analizzando i tuoi pasti...",
                subtab_7_days: "Giorni",
                subtab_8_weeks: "Settimane",
                subtab_monthly_history: "Mesi",
                title_media_complessiva: "Media complessiva",
                lbl_confirm: "Conferma",
                lbl_cancel: "Annulla",
                lbl_save: "Salva",
                title_modifica_pasto: "Modifica pasto",
                btn_recalculate_save: "Ricalcola e Salva",
                lbl_time: "Ora",
                lbl_meal_text: "Testo del pasto",
                lbl_last_analysis: "Ultima analisi",
                lbl_macro_breakdown: "Ripartizione Macronutrienti",
                btn_save_to_diary: "Salva nel diario",
                lbl_food_diary: "Diario alimentare",
                btn_delete_all: "Cancella tutto",
                btn_export_data: "Esporta dati",
                btn_import_data: "Importa dati",
                lbl_no_meals_saved: "Nessun pasto salvato ancora.\nElabora e salva un'analisi dalla tab Dati!",
                lbl_avg_weekly_weight: "Peso Medio Settimanale",
                lbl_avg_monthly_weight: "Peso Medio Mensile",
                lbl_avg_monthly_calories: "Calorie Medie Mensili",
                lbl_avg_monthly_proteins: "Proteine Medie Mensili",
                lbl_avg_monthly_carbs: "Carboidrati Medi Mensili",
                lbl_avg_monthly_fats: "Grassi Medi Mensili",
                lbl_ai_recalculate_hint: "L'AI ricalcoler\u00e0 i nutrienti basandosi su questo testo.",
                lbl_ai_target_title: "Generatore Target AI",
                lbl_cur_weight: "Peso Att. (kg)",
                lbl_target_weight_short: "Peso Des. (kg)",
                lbl_height_cm: "Altezza (cm)",
                lbl_training_style: "Stile di allenamento / Attivit\u00e0",
                lbl_main_goal: "Obiettivo principale",
                btn_generate_target: "Calcola target",
                lbl_ai_calculating: "L'AI sta calcolando i tuoi target...",
                lbl_ai_suggestion_title: "Suggerimento Target AI:",
                lbl_calories_colon: "Calorie:",
                lbl_target_weight_colon: "Peso Target:",
                lbl_proteins_colon: "Proteine:",
                lbl_carbs_colon: "Carbo:",
                lbl_fats_colon: "Grassi:",
                btn_apply_targets: "Applica questi target",
                lbl_privacy_note: "Le chiavi e i target vengono memorizzati solo sul tuo dispositivo (localStorage).",
                title_backup_auto: "Salvataggio automatico locale (JSON)",
                btn_select_file: "Associa file database",
                lbl_gender: "Sesso",
                opt_male: "Uomo",
                opt_female: "Donna",
                lbl_age: "Età (anni)",
                pl_training_style: "es. Palestra 3 volte a settimana, lavoro sedentario",
                pl_main_goal: "es. Aumentare massa muscolare magra",
                pl_weight: "es. 75",
                pl_target_weight: "es. 70",
                pl_height: "es. 180",
                pl_age_placeholder: "es. 30"
            },
            en: {
                title_api_settings: "Settings",
                title_macronutrienti: "Macronutrients",
                title_peso_calorie: "Weight & Calories",
                label_api_key: "Gemini API Key",
                label_language: "Language / Lingua",
                label_daily_targets: "Daily Targets",
                label_calorie: "Calories",
                label_peso: "Target Weight",
                label_proteine: "Proteins",
                label_carboidrati: "Carbohydrates",
                label_grassi: "Fats",
                btn_calculate_ai: "Calculate targets with AI",
                tab_oggi: "Log",
                tab_trend: "Trends",
                tab_storico: "Record",
                label_body_weight: "Body Weight Logger",
                btn_save_weight: "Save Weight",
                btn_ask_ai_opinion: "Analyze with AI",
                btn_ask_ai_trend: "Ask AI for trend analysis",
                trend_title_days: "Trend last 7 days",
                trend_title_weeks: "Trend last 8 weeks (Average/Day)",
                trend_title_months: "Monthly Record (From beginning)",
                placeholder_input_pasto: "E.g. This morning Greek yogurt...",
                placeholder_weight_input: "e.g. 74.5",
                prompt_what_did_you_eat: "What did you eat?",
                label_date: "Date",
                label_date_colon: "Date:",
                label_calorie_uppercase: "CALORIES",
                label_proteine_uppercase: "PROTEINS",
                label_carboidrati_uppercase: "CARBS",
                label_carbo_uppercase: "CARBS",
                label_grassi_uppercase: "FATS",
                label_peso_kg: "Weight (kg)",
                title_totale_oggi: "Today's Total",
                btn_ask_ai_opinion_short: "Ask AI Opinion",
                lbl_ai_analyzing_meals: "AI is analyzing your meals...",
                subtab_7_days: "Days",
                subtab_8_weeks: "Weeks",
                subtab_monthly_history: "Months",
                title_media_complessiva: "Overall Average",
                lbl_confirm: "Confirm",
                lbl_cancel: "Cancel",
                lbl_save: "Save",
                title_modifica_pasto: "Edit Meal",
                btn_recalculate_save: "Recalculate & Save",
                lbl_time: "Time",
                lbl_meal_text: "Meal Description",
                lbl_last_analysis: "Last Analysis",
                lbl_macro_breakdown: "Macronutrient Breakdown",
                btn_save_to_diary: "Save to Diary",
                lbl_food_diary: "Food Diary",
                btn_delete_all: "Delete all",
                btn_export_data: "Export data",
                btn_import_data: "Import data",
                lbl_no_meals_saved: "No meals saved yet.\nAnalyze and save a meal from the Log tab!",
                lbl_avg_weekly_weight: "Avg Weekly Weight",
                lbl_avg_monthly_weight: "Avg Monthly Weight",
                lbl_avg_monthly_calories: "Avg Monthly Calories",
                lbl_avg_monthly_proteins: "Avg Monthly Proteins",
                lbl_avg_monthly_carbs: "Avg Monthly Carbs",
                lbl_avg_monthly_fats: "Avg Monthly Fats",
                lbl_ai_recalculate_hint: "The AI will recalculate the nutrients based on this text.",
                lbl_ai_target_title: "AI Target Generator",
                lbl_cur_weight: "Curr. Weight (kg)",
                lbl_target_weight_short: "Goal Weight (kg)",
                lbl_height_cm: "Height (cm)",
                lbl_training_style: "Training style / Activity",
                lbl_main_goal: "Main goal",
                btn_generate_target: "Calculate targets",
                lbl_ai_calculating: "AI is calculating your targets...",
                lbl_ai_suggestion_title: "AI Target Suggestion:",
                lbl_calories_colon: "Calories:",
                lbl_target_weight_colon: "Target Weight:",
                lbl_proteins_colon: "Proteins:",
                lbl_carbs_colon: "Carbs:",
                lbl_fats_colon: "Fats:",
                btn_apply_targets: "Apply these targets",
                lbl_privacy_note: "Keys and targets are stored only on your device (localStorage).",
                title_backup_auto: "Local Auto-Save (JSON)",
                btn_select_file: "Link database file",
                lbl_gender: "Gender",
                opt_male: "Male",
                opt_female: "Female",
                lbl_age: "Age (years)",
                pl_training_style: "e.g. Gym 3 times a week, sedentary job",
                pl_main_goal: "e.g. Increase lean muscle mass",
                pl_weight: "e.g. 75",
                pl_target_weight: "e.g. 70",
                pl_height: "e.g. 180",
                pl_age_placeholder: "e.g. 30"
            }
        };

        window.currentLang = 'it';

        window.changeLanguage = function (lang) {
            window.currentLang = lang;
            localStorage.setItem('app_lang', lang);

            // 0. Aggiorna il badge lingua nel header
            const langLabel = document.getElementById('langLabel');
            if (langLabel) langLabel.innerText = lang.toUpperCase();
            const langFlag = document.getElementById('langFlag');
            if (langFlag) {
                langFlag.src = lang === 'it' ? 'https://flagcdn.com/20x15/it.png' : 'https://flagcdn.com/20x15/gb.png';
                langFlag.alt = lang.toUpperCase();
            }

            // 1. Aggiorna tutti gli elementi statici con data-i18n
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (TRANSLATIONS[window.currentLang] && TRANSLATIONS[window.currentLang][key]) {
                    el.innerText = TRANSLATIONS[window.currentLang][key];
                }
            });

            // 2. Aggiorna i placeholder degli input e title tooltip AI
            const inputPasto = document.getElementById('testoInput');
            if (inputPasto) inputPasto.placeholder = TRANSLATIONS[window.currentLang].placeholder_input_pasto;

            const inputPesoVal = document.getElementById('input-peso-valore');
            if (inputPesoVal) inputPesoVal.placeholder = TRANSLATIONS[window.currentLang].placeholder_weight_input;

            const btnAI = document.getElementById('btnAnalisiTrendAI');
            if (btnAI && TRANSLATIONS[window.currentLang]) {
                btnAI.title = TRANSLATIONS[window.currentLang].btn_ask_ai_trend;
            }

            const inputAttivita = document.getElementById('aiAttivita');
            if (inputAttivita && TRANSLATIONS[window.currentLang].pl_training_style) {
                inputAttivita.placeholder = TRANSLATIONS[window.currentLang].pl_training_style;
            }

            const inputObiettivo = document.getElementById('aiObiettivo');
            if (inputObiettivo && TRANSLATIONS[window.currentLang].pl_main_goal) {
                inputObiettivo.placeholder = TRANSLATIONS[window.currentLang].pl_main_goal;
            }

            const aiPeso = document.getElementById('aiPeso');
            if (aiPeso && TRANSLATIONS[window.currentLang].pl_weight) {
                aiPeso.placeholder = TRANSLATIONS[window.currentLang].pl_weight;
            }

            const aiPesoTarget = document.getElementById('aiPesoTarget');
            if (aiPesoTarget && TRANSLATIONS[window.currentLang].pl_target_weight) {
                aiPesoTarget.placeholder = TRANSLATIONS[window.currentLang].pl_target_weight;
            }

            const aiAltezza = document.getElementById('aiAltezza');
            if (aiAltezza && TRANSLATIONS[window.currentLang].pl_height) {
                aiAltezza.placeholder = TRANSLATIONS[window.currentLang].pl_height;
            }

            const aiEta = document.getElementById('aiEta');
            if (aiEta && TRANSLATIONS[window.currentLang].pl_age_placeholder) {
                aiEta.placeholder = TRANSLATIONS[window.currentLang].pl_age_placeholder;
            }

            // Traduzione automatica dei valori correnti nei campi profilo se corrispondono ai default
            if (inputAttivita) {
                const val = inputAttivita.value.trim().toLowerCase();
                if (lang === 'en') {
                    if (val === 'palestra 3 volte la setitmana' || val === 'palestra 3 volte a settimana') {
                        inputAttivita.value = 'gym 3 times a week';
                        localStorage.setItem('profile_attivita', 'gym 3 times a week');
                    }
                } else if (lang === 'it') {
                    if (val === 'gym 3 times a week') {
                        inputAttivita.value = 'palestra 3 volte la setitmana';
                        localStorage.setItem('profile_attivita', 'palestra 3 volte la setitmana');
                    }
                }
            }

            if (inputObiettivo) {
                const val = inputObiettivo.value.trim().toLowerCase();
                if (lang === 'en') {
                    if (val === 'aumentare massa muscolare' || val === 'aumentare massa muscolare magra') {
                        inputObiettivo.value = 'increase muscle mass';
                        localStorage.setItem('profile_obiettivo', 'increase muscle mass');
                    }
                } else if (lang === 'it') {
                    if (val === 'increase muscle mass' || val === 'increase lean muscle mass') {
                        inputObiettivo.value = 'aumentare massa muscolare';
                        localStorage.setItem('profile_obiettivo', 'aumentare massa muscolare');
                    }
                }
            }

            // Aggiorna le etichette della legenda del grafico macronutrienti (ciambella)
            if (macroChart) {
                macroChart.data.labels = lang === 'en' 
                    ? ['Proteins', 'Carbohydrates', 'Fats'] 
                    : ['Proteine', 'Carboidrati', 'Grassi'];
                macroChart.update();
            }

            // 3. Forza l'aggiornamento dei titoli dinamici del trend se necessario - RIMOSSO
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // 4. Ri-esegue il render delle varie liste per aggiornare i testi
            aggiornaTotaleGiorno();
            if (document.getElementById('panel-storico').classList.contains('active')) renderStorico();
            if (document.getElementById('panel-trend').classList.contains('active')) {
                if (trendView === 'mesi') {
                    renderTrendMensile();
                } else {
                    renderTrend();
                }
            }
            if (typeof aggiornaStatoFileAuto === 'function') {
                aggiornaStatoFileAuto();
            }
        };

        // Cicla tra le lingue disponibili (IT → EN → IT …)
        window.cycleLang = function () {
            const next = window.currentLang === 'it' ? 'en' : 'it';
            changeLanguage(next);
        };



        // ================================================================
        // INIT
        // ================================================================
        window.onload = function () {
            const savedGemini = localStorage.getItem('gemini_apikey');
            if (savedGemini) document.getElementById('geminiKey').value = savedGemini;

            // Carica lingua salvata
            const savedLang = localStorage.getItem('app_lang') || 'it';
            changeLanguage(savedLang);

            // Carica tema salvato
            const savedTheme = localStorage.getItem('app_theme') || 'dark';
            window.applicaTema(savedTheme);

            // Carica lo stato dell'associazione del file database locale
            if (typeof aggiornaStatoFileAuto === 'function') aggiornaStatoFileAuto();

            // Carica profilo AI salvato
            const pPeso = localStorage.getItem('profile_peso');
            if (pPeso) {
                const aiPesoInput = document.getElementById('aiPeso');
                if (aiPesoInput) aiPesoInput.value = pPeso;
            }
            const pAltezza = localStorage.getItem('profile_altezza');
            if (pAltezza) {
                const aiAltezzaInput = document.getElementById('aiAltezza');
                if (aiAltezzaInput) aiAltezzaInput.value = pAltezza;
            }
            const pAttivita = localStorage.getItem('profile_attivita');
            if (pAttivita) {
                const aiAttivitaInput = document.getElementById('aiAttivita');
                if (aiAttivitaInput) aiAttivitaInput.value = pAttivita;
            }
            const pObiettivo = localStorage.getItem('profile_obiettivo');
            if (pObiettivo) {
                const aiObiettivoInput = document.getElementById('aiObiettivo');
                if (aiObiettivoInput) aiObiettivoInput.value = pObiettivo;
            }
            const pPesoTarget = localStorage.getItem('profile_peso_target');
            if (pPesoTarget) {
                const aiPesoTargetInput = document.getElementById('aiPesoTarget');
                if (aiPesoTargetInput) aiPesoTargetInput.value = pPesoTarget;
            }
            const pSesso = localStorage.getItem('profile_sesso');
            if (pSesso) {
                const aiSessoInput = document.getElementById('aiSesso');
                if (aiSessoInput) aiSessoInput.value = pSesso;
            }
            const pEta = localStorage.getItem('profile_eta');
            if (pEta) {
                const aiEtaInput = document.getElementById('aiEta');
                if (aiEtaInput) aiEtaInput.value = pEta;
            }

            // Carica target
            targetCalorie = parseInt(localStorage.getItem('target_calorie')) || 2000;
            targetProteine = parseInt(localStorage.getItem('target_proteine')) || 160;
            targetCarbo = parseInt(localStorage.getItem('target_carbo')) || 200;
            targetGrassi = parseInt(localStorage.getItem('target_grassi')) || 70;
            pesoTarget = parseFloat(localStorage.getItem('targetPeso')) || 75;


            document.getElementById('targetCalorie').value = targetCalorie;
            document.getElementById('targetProteine').value = targetProteine;
            document.getElementById('targetCarbo').value = targetCarbo;
            document.getElementById('targetGrassi').value = targetGrassi;
            document.getElementById('targetPeso').value = localStorage.getItem('targetPeso') || "";

            if (!savedGemini) document.getElementById('settingsBox').classList.remove('hidden');

            aggiornaTotaleGiorno();
            caricaPesoDelGiorno();
            // Precompila il campo data del peso con la data di oggi all'avvio
            if (document.getElementById('input-peso-data')) {
                document.getElementById('input-peso-data').value = ottieniDataOggi();
            }
            // Imposta di default la data di oggi anche per il pasto
            if (document.getElementById('input-pasto-data')) {
                document.getElementById('input-pasto-data').value = ottieniDataOggi();
            }
        };

        // ================================================================
        // UTILS DATE
        // ================================================================
        function ottieniDataOggi() {
            const d = new Date();
            const anno = d.getFullYear();
            const mese = String(d.getMonth() + 1).padStart(2, '0');
            const giorno = String(d.getDate()).padStart(2, '0');
            return `${anno}-${mese}-${giorno}`;
        }

        // ================================================================
        // GESTIONE PESO
        // ================================================================
        function toggleWeightSection() {
            const content = document.getElementById('weightSectionContent');
            const icon = document.getElementById('weightToggleIcon');
            if (content.classList.contains('hidden')) {
                content.classList.remove('hidden');
                icon.classList.add('rotate-180');
            } else {
                content.classList.add('hidden');
                icon.classList.remove('rotate-180');
            }
        }

        function caricaPesoDelGiorno() {
            const inputPesoValore = document.getElementById('input-peso-valore');
            if (!inputPesoValore) return; // Protezione se l'elemento non viene trovato

            const dataSelezionata = document.getElementById('input-peso-data')?.value || ottieniDataOggi();
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const giornoEsistente = db.find(g => g.data === dataSelezionata);

            if (giornoEsistente && giornoEsistente.peso) {
                inputPesoValore.value = giornoEsistente.peso;
            } else {
                inputPesoValore.value = '';
            }
        }

        function salvaPesoDelGiorno() {
            const oggiStr = ottieniDataOggi();
            const pesoVal = parseFloat(document.getElementById('input-peso-valore')?.value) || null;
            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];

            let recordOggi = db.find(x => x.data === oggiStr);
            if (recordOggi) {
                recordOggi.peso = pesoVal;
            } else {
                db.push({
                    id: Date.now(),
                    data: dataPasto,
                    calorie: 0,
                    proteine: 0,
                    carboidrati: 0,
                    grassi: 0,
                    pasti: [],
                    peso: pesoVal
                });
            }
            salvaDatabase(db);
        }

        // ================================================================
        // TAB NAVIGATION
        // ================================================================
        function switchTab(tab) {
            ['oggi', 'storico', 'trend'].forEach(t => {
                document.getElementById('panel-' + t).classList.remove('active');
                document.getElementById('tab-' + t).classList.remove('active');
            });
            document.getElementById('panel-' + tab).classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');

            if (tab === 'storico') renderStorico();
            if (tab === 'trend') {
                // Ripristina il grafico corretto in base al sotto-tab che era attivo
                if (trendView === 'mesi') {
                    renderTrendMensile();
                } else {
                    renderTrend();
                }
            }
            lucide.createIcons();
        }

        function switchTrendView(view) {
            trendView = view;

            // Gestione classi attive sui 3 bottoni
            document.getElementById('subtab-giorni').classList.toggle('active', view === 'giorni');
            document.getElementById('subtab-settimane').classList.toggle('active', view === 'settimane');
            document.getElementById('subtab-mesi').classList.toggle('active', view === 'mesi');

            // Mostra o nasconde i relativi contenitori HTML
            document.getElementById('trendGiornalieroContainer').classList.toggle('hidden', view !== 'giorni');
            document.getElementById('trendSettimaneContainer').classList.toggle('hidden', view !== 'settimane');

            const contMesi = document.getElementById('trendMesiContainer');
            if (contMesi) {
                contMesi.classList.toggle('hidden', view !== 'mesi');
            }

            // Cambia il titolo dinamico in alto - RIMOSSO
            lucide.createIcons();

            // Seleziona quale funzione di rendering eseguire
            if (view === 'mesi') {
                renderTrendMensile();
            } else {
                renderTrend();
            }
        }
        // ================================================================
        // SETTINGS / PROVIDER
        // ================================================================
        function toggleSettings() {
            document.getElementById('settingsBox').classList.toggle('hidden');
        }

        function saveGeminiKey() {
            const keyVal = document.getElementById('geminiKey').value.trim();
            localStorage.setItem('gemini_apikey', keyVal);
        }

        function saveTarget() {
            targetCalorie = parseInt(document.getElementById('targetCalorie').value) || 0;
            targetProteine = parseInt(document.getElementById('targetProteine').value) || 0;
            targetCarbo = parseInt(document.getElementById('targetCarbo').value) || 0;
            targetGrassi = parseInt(document.getElementById('targetGrassi').value) || 0;
            pesoInput = parseInt(document.getElementById('targetPeso').value);

            localStorage.setItem('target_calorie', targetCalorie);
            localStorage.setItem('target_proteine', targetProteine);
            localStorage.setItem('target_carbo', targetCarbo);
            localStorage.setItem('target_grassi', targetGrassi);
            localStorage.setItem('targetPeso', pesoInput);

            // Aggiorna la variabile globale leggendo il valore inserito (usa il fallback se vuoto)
            pesoTarget = parseFloat(pesoInput) || 75;

            // Ricalcola e ridisegna il grafico
            if (document.getElementById('panel-trend').classList.contains('active')) {
                if (trendView === 'mesi') {
                    renderTrendMensile();
                } else {
                    renderTrend();
                }
            }
            aggiornaTotaleGiorno();
            autoSalvaNelFileLocale();
        }

        // ================================================================
        // LOGICA DI CALCOLO E PROGRESSI ODIERNI
        // ================================================================
        function aggiornaTotaleGiorno() {
            const oggiStr = ottieniDataOggi();
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const recordOggi = db.find(x => x.data === oggiStr);

            // Scrivi target nell'interfaccia UI dei trend
            document.getElementById('trendTargetCalorie').innerText = targetCalorie || '—';
            document.getElementById('trendTargetProteine').innerText = (targetProteine ? targetProteine + 'g' : '—');
            document.getElementById('trendTargetCarbo').innerText = (targetCarbo ? targetCarbo + 'g' : '—');
            document.getElementById('trendTargetGrassi').innerText = (targetGrassi ? targetGrassi + 'g' : '—');

            if (recordOggi) {
                document.getElementById('boxTotaleGiorno').classList.remove('hidden');

                const cal = Math.round(recordOggi.calorie || 0);
                const prot = Math.round(recordOggi.proteine || 0);
                const carb = Math.round(recordOggi.carboidrati || 0);
                const fat = Math.round(recordOggi.grassi || 0);

                document.getElementById('totCalorie').innerText = cal;
                document.getElementById('totProteine').innerText = prot;
                document.getElementById('totCarbo').innerText = carb;
                document.getElementById('totGrassi').innerText = fat;

                document.getElementById('targetCalorieVal').innerText = targetCalorie || '—';
                document.getElementById('targetProteineVal').innerText = targetProteine || '—';
                document.getElementById('targetCarboVal').innerText = targetCarbo || '—';
                document.getElementById('targetGrassiVal').innerText = targetGrassi || '—';

                const pCal = targetCalorie > 0 ? Math.round((cal / targetCalorie) * 100) : 0;
                const pProt = targetProteine > 0 ? Math.round((prot / targetProteine) * 100) : 0;
                const pCarb = targetCarbo > 0 ? Math.round((carb / targetCarbo) * 100) : 0;
                const pFat = targetGrassi > 0 ? Math.round((fat / targetGrassi) * 100) : 0;

                document.getElementById('percCalorie').innerText = pCal + '%';
                document.getElementById('percProteine').innerText = pProt + '%';
                document.getElementById('percCarbo').innerText = pCarb + '%';
                document.getElementById('percGrassi').innerText = pFat + '%';

                const calcolaBarraETargetDati = (attuale, target) => {
                    if (!target || target <= 0) return { barra: '0%', freccia: '100%' };
                    if (attuale > target) {
                        return {
                            barra: '100%',
                            freccia: ((target / attuale) * 100) + '%'
                        };
                    } else {
                        return {
                            barra: ((attuale / target) * 100) + '%',
                            freccia: '100%'
                        };
                    }
                };

                const resCal = calcolaBarraETargetDati(cal, targetCalorie);
                document.getElementById('barCalorie').style.width = resCal.barra;
                document.getElementById('arrowCalorie').style.left = resCal.freccia;

                const resProt = calcolaBarraETargetDati(prot, targetProteine);
                document.getElementById('barProteine').style.width = resProt.barra;
                document.getElementById('arrowProteine').style.left = resProt.freccia;

                const resCarb = calcolaBarraETargetDati(carb, targetCarbo);
                document.getElementById('barCarbo').style.width = resCarb.barra;
                document.getElementById('arrowCarbo').style.left = resCarb.freccia;

                const resFat = calcolaBarraETargetDati(fat, targetGrassi);
                document.getElementById('barGrassi').style.width = resFat.barra;
                document.getElementById('arrowGrassi').style.left = resFat.freccia;
            } else {
                document.getElementById('boxTotaleGiorno').classList.add('hidden');
            }
        }

        // ================================================================
        // CHIAMATE AI (OPENAI E GEMINI)
        // ================================================================
        async function analizzaDatiConAI() {
            const testo = document.getElementById('testoInput').value.trim();
            if (!testo) {
                await customAlert("Testo vuoto", "Inserisci una descrizione degli alimenti consumati!");
                return;
            }

            const apiKey = localStorage.getItem('gemini_apikey');
            if (!apiKey) {
                toggleSettings();
                await customAlert("API Key mancante", currentLang === 'en' ? "Please insert your Gemini API Key in the settings!" : "Inserisci la tua Gemini API Key nelle impostazioni!");
                return;
            }

            document.getElementById('stato').classList.remove('hidden');
            document.getElementById('btnInvia').disabled = true;
            document.getElementById('btnInvia').style.opacity = "0.6";

            const prof = ottieniProfiloUtente();
            const promptSistema = currentLang === 'en'
                ? `You are an expert nutritionist. Analyze the user text containing foods. Calculate total Calories, Proteins (g), Carbohydrates (g), Fats (g). Respond ONLY with a valid JSON object (no markdown, do not wrap in \`\`\`json block) with the following numerical keys: "calorie", "proteine", "carboidrati", "grassi". Be realistic and precise in the estimates.
IMPORTANT: If the user does not specify portions, weights, or quantities for a food item, you MUST calculate a moderate, standard portion suitable for a single person with the user's characteristics: biological sex ${prof.sesso}, age ${prof.eta || '30'} years old, weight ${prof.peso || '75'} kg, height ${prof.altezza || '175'} cm, and daily target of ${prof.targetCalorie || '2000'} kcal. Adjust estimates conservatively based on these parameters rather than high-balling.`
                : `Sei un esperto nutrizionista. Analizza il testo inserito dall'utente contenente alimenti. Calcola Calorie totali, Proteine (g), Carboidrati (g), Grassi (g). Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown, senza racchiuderlo in codice tipo \`\`\`json) avente le seguenti chiavi numeriche: "calorie", "proteine", "carboidrati", "grassi". Sii realistico e preciso nelle stime.
IMPORTANTE: Se l'utente non specifica le porzioni, pesi o quantità per un alimento, devi considerare e stimare una porzione standard moderata adatta a una singola persona con le caratteristiche fisiche dell'utente: sesso biologico ${prof.sesso}, età ${prof.eta || '30'} anni, peso ${prof.peso || '75'} kg, altezza ${prof.altezza || '175'} cm, fabbisogno calorico target giornaliero di ${prof.targetCalorie || '2000'} kcal. Regola le stime in modo conservativo basandoti su questi parametri, evitando sovrastime.`;

            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{ text: promptSistema + "\n\n" + (currentLang === 'en' ? "User text to analyze:" : "Testo utente da analizzare:") + "\n" + testo }]
                        }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.2
                        }
                    })
                });
                if (!response.ok) throw new Error("Errore risposta server Gemini API");
                const data = await response.json();
                const rawContent = data.candidates[0].content.parts[0].text.trim();
                const jsonRes = JSON.parse(rawContent);

                mostraRisultati(jsonRes);
            } catch (err) {
                console.error(err);
                await customAlert("Errore di analisi", "Si è verificato un errore nell'analisi AI. Controlla la chiave di configurazione e la connessione internet.");
            } finally {
                document.getElementById('stato').classList.add('hidden');
                document.getElementById('btnInvia').disabled = false;
                document.getElementById('btnInvia').style.opacity = "1";
            }
        }

        window.valutaGiornataConAI = async function () {
            const btn = document.getElementById('btnValutaGiornata');
            const boxSuggerimenti = document.getElementById('boxSuggerimentiAI');
            const testoSuggerimenti = document.getElementById('testoSuggerimentiAI');

            // Recupera i valori attuali dallo schermo o dallo stato dell'app
            const calorie = document.getElementById('totCalorie').innerText;
            const targetCalorie = document.getElementById('targetCalorieVal').innerText;
            const proteine = document.getElementById('totProteine').innerText;
            const targetProteine = document.getElementById('targetProteineVal').innerText;
            const carbo = document.getElementById('totCarbo').innerText;
            const targetCarbo = document.getElementById('targetCarboVal').innerText;
            const grassi = document.getElementById('totGrassi').innerText;
            const targetGrassi = document.getElementById('targetGrassiVal').innerText;

            // Recupera l'elenco dei pasti di oggi dal database locale
            const dataOggi = ottieniDataOggi();
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const giornoOggi = db.find(g => g.data === dataOggi);
            const pastiDellaGiornata = giornoOggi && giornoOggi.pasti && giornoOggi.pasti.length > 0
                ? giornoOggi.pasti.map(p => `- [${p.ora || ''}] ${p.testo} (${p.calorie} kcal)`).join('\n')
                : (currentLang === 'en' ? "No meals logged yet today." : "Nessun pasto registrato ancora oggi.");

            // Recupera credenziali di configurazione
            const geminiKey = localStorage.getItem('gemini_apikey');

            if (!geminiKey) {
                await customAlert("API Key mancante", currentLang === 'en' ? "Please insert your Gemini API Key in the settings first!" : "Inserisci prima la tua API Key nelle impostazioni (icona ingranaggio in alto).");
                return;
            }

            // Cambia stato del bottone durante il caricamento
            btn.disabled = true;
            btn.innerHTML = currentLang === 'en' ? `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Analyzing...` : `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i> Elaborazione...`;
            lucide.createIcons();

            boxSuggerimenti.classList.remove('hidden');
            testoSuggerimenti.innerHTML = currentLang === 'en' ? `<span class="italic text-slate-400">The AI is analyzing your macro split today...</span>` : `<span class="italic text-slate-400">L'AI sta analizzando la tua ripartizione dei macro odierni...</span>`;

            // Prompt inviato all'AI
            const prompt = currentLang === 'en'
                ? `Act as an expert nutritionist and trainer. Make a very brief, friendly, and synthetic evaluation of the macronutrients consumed today compared to the user's targets, giving practical and immediate suggestions on what to eat or avoid for the rest of the day.
    Today's data:
    - Calories: ${calorie} kcal consumed out of a target of ${targetCalorie} kcal.
    - Proteins: ${proteine}g consumed out of a target of ${targetProteine}g.
    - Carbohydrates: ${carbo}g consumed out of a target of ${targetCarbo}g.
    - Fats: ${grassi}g consumed out of a target of ${targetGrassi}g.
    
    Meals consumed today:
    ${pastiDellaGiornata}
    
    Analyze the meals consumed today to understand context (e.g. which main meals like breakfast, lunch, dinner or snacks have already been done, or the time and food choices) and absolutely avoid proposing meals that have already been eaten (e.g. do not suggest a full lunch if they already logged lunch, or pasta at dinner if they already reached or exceeded carbs). Instead, provide targeted ideas for missing snacks or dinner/breakfast if missing.
    Respond in maximum 3 or 4 sentences, very compactly, using bullet points if needed. Be motivational.`
                : `Agisci come un esperto nutrizionista e trainer. Fai una brevissima valutazione sintetica e amichevole dei macronutrienti consumati oggi rispetto ai target dell'utente, dando suggerimenti pratici ed immediati su cosa mangiare o evitare per il resto della giornata.
    Dati di oggi:
    - Calorie: ${calorie} kcal consumate su un target di ${targetCalorie} kcal.
    - Proteine: ${proteine}g consumate su un target di ${targetProteine}g.
    - Carboidrati: ${carbo}g consumati su un target di ${targetCarbo}g.
    - Grassi: ${grassi}g consumati su un target di ${targetGrassi}g.
    
    Pasti consumati oggi:
    ${pastiDellaGiornata}
    
    Analizza i pasti consumati oggi per comprendere il contesto (ad esempio, quali pasti principali come colazione, pranzo, cena o spuntini sono già stati effettuati, o l'orario e la tipologia di alimenti scelti) ed evita assolutamente di proporre pasti che sono già stati consumati (es. non suggerire un pranzo completo se l'utente ha già pranzato, o non suggerire pasta a cena se ha già raggiunto o superato i target di carbo). Fornisci invece spunti mirati per gli spuntini mancanti o per la cena/colazione qualora manchino all'appello.
    Rispondi in massimo 3 o 4 frasi, in modo molto compatto, usando elenchi puntati se necessario. Sii motivante.`;

            try {
                let rispostaTesto = "";

                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }]
                    })
                });
                const data = await response.json();
                if (data.error) throw new Error(data.error.message);
                rispostaTesto = data.candidates[0].content.parts[0].text;

                // Formatta la risposta sostituendo gli a capo con dei tag <br> per l'HTML
                testoSuggerimenti.innerHTML = rispostaTesto.replace(/\n/g, '<br>');

            } catch (error) {
                console.error(error);
                testoSuggerimenti.innerHTML = currentLang === 'en' ? `<span class="text-rose-400">Evaluation error: ${error.message}</span>` : `<span class="text-rose-400">Errore nella valutazione: ${error.message}</span>`;
            } finally {
                // Ripristina il bottone originale
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="sparkles" class="w-3 h-3"></i> Chiedi parere AI`;
                lucide.createIcons();
            }
        };

        function mostraRisultati(data) {
            ultimaAnalisi = data;
            document.getElementById('boxRisultati').classList.remove('hidden');

            document.getElementById('resCalorie').innerText = Math.round(data.calorie || 0);
            document.getElementById('resProteine').innerText = Math.round(data.proteine || 0);
            document.getElementById('resCarbo').innerText = Math.round(data.carboidrati || 0);
            document.getElementById('resGrassi').innerText = Math.round(data.grassi || 0);

            macroChart.data.datasets[0].data = [
                Math.round(data.proteine || 0),
                Math.round(data.carboidrati || 0),
                Math.round(data.grassi || 0)
            ];
            macroChart.update();
            document.getElementById('boxRisultati').scrollIntoView({ behavior: 'smooth' });
        }

        // ================================================================
        // SALVATAGGIO DEI DATI NEL DIARIO LOCALE
        // ================================================================
        window.salvaEntry = async function () {
            // 1. Controllo di sicurezza
            if (!ultimaAnalisi) {
                await customAlert(currentLang === 'en' ? "No Analysis" : "Nessuna analisi", currentLang === 'en' ? "No analysis to save yet!" : "Nessuna analisi da salvare!");
                return;
            }

            // 2. Recupero dati in sicurezza
            const inputData = document.getElementById('input-pasto-data');
            if (!inputData) {
                await customAlert("Errore", "Errore: Selettore data non trovato.");
                return;
            }

            const dataPasto = inputData.value || ottieniDataOggi();
            const oraStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            const testoInput = document.getElementById('testoInput');
            const testoPasto = testoInput ? testoInput.value.trim() : "";

            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            let record = db.find(x => x.data === dataPasto);

            const nuovoPasto = {
                id: Date.now(),
                ora: oraStr,
                testo: testoPasto,
                calorie: Number(ultimaAnalisi.calorie) || 0,
                proteine: Number(ultimaAnalisi.proteine) || 0,
                carboidrati: Number(ultimaAnalisi.carboidrati) || 0,
                grassi: Number(ultimaAnalisi.grassi) || 0
            };

            // 3. Logica di aggiornamento DB
            if (record) {
                record.calorie = (record.calorie || 0) + nuovoPasto.calorie;
                record.proteine = (record.proteine || 0) + nuovoPasto.proteine;
                record.carboidrati = (record.carboidrati || 0) + nuovoPasto.carboidrati;
                record.grassi = (record.grassi || 0) + nuovoPasto.grassi;
                if (!record.pasti) record.pasti = [];
                record.pasti.push(nuovoPasto);
            } else {
                // CORRETTO: Usiamo dataPasto e nuovoPasto.grassi (niente più typo)
                db.push({
                    id: Date.now(),
                    data: dataPasto,
                    calorie: nuovoPasto.calorie,
                    proteine: nuovoPasto.proteine,
                    carboidrati: nuovoPasto.carboidrati,
                    grassi: nuovoPasto.grassi,
                    pasti: [nuovoPasto],
                    peso: parseFloat(document.getElementById('input-peso-valore')?.value) || null
                });
            }

            // 4. Salvataggio e pulizia
            salvaDatabase(db);

            if (testoInput) testoInput.value = "";
            const boxRis = document.getElementById('boxRisultati');
            if (boxRis) boxRis.classList.add('hidden');

            ultimaAnalisi = null;

            aggiornaTotaleGiorno();
            renderStorico();
            await customAlert("Pasto registrato", "Pasto registrato con successo!", true);
        };

        // ================================================================
        // RENDER DELLA SEZIONE STORICO
        // ================================================================
        function renderStorico() {
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const lista = document.getElementById('listaStorico');
            if (!lista) return;

            if (db.length === 0) {
                lista.innerHTML = `<p class="text-sm text-slate-500 text-center py-8">${currentLang === 'en' ? 'No meals saved yet.<br>Analyze and save a meal from the Log tab!' : 'Nessun pasto salvato ancora.<br>Elabora e salva un\'analisi dalla tab Dati!'}</p>`;
                return;
            }

            // Ordina le date dalla più recente alla più vecchia
            const dbOrdinato = [...db].sort((a, b) => new Date(b.data) - new Date(a.data));

            let html = "";
            dbOrdinato.forEach(giorno => {
                let pastiHtml = "";
                if (giorno.pasti && giorno.pasti.length > 0) {
                    giorno.pasti.forEach(p => {
                        pastiHtml += `
                <div class="bg-slate-900/40 border border-slate-700/30 rounded-xl p-3 space-y-1.5 relative group">
                    <div class="flex justify-between items-start gap-2">
                        <span class="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <i data-lucide="clock" class="w-3 h-3"></i> ${p.ora || '--:--'}
                        </span>
                        
                        <div class="flex items-center gap-2 relative z-30">
                            <button onclick="apriModalModifica(${giorno.id}, ${p.id})" 
                                    class="text-slate-400 hover:text-blue-400 p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 transition cursor-pointer flex items-center justify-center" 
                                    title="Modifica pasto">
                                <i data-lucide="pencil" class="w-3.5 h-3.5 pointer-events-none"></i>
                            </button>
                            <button onclick="eliminaPasto('${giorno.data}', ${p.id})" 
                                    class="text-slate-400 hover:text-rose-400 p-2 rounded-lg bg-slate-800/80 border border-slate-700/50 transition cursor-pointer flex items-center justify-center" 
                                    title="Elimina pasto">
                                <i data-lucide="trash" class="w-3.5 h-3.5 pointer-events-none"></i>
                            </button>
                        </div>
                    </div>
                    <p class="text-xs text-slate-300 font-normal leading-relaxed overflow-x-auto pr-1 whitespace-pre-wrap">${p.testo}</p>
                    <div class="flex flex-wrap gap-1.5 mt-0.5">
                        <span class="pasto-tag"><i data-lucide="flame" class="w-3 h-3 text-rose-400"></i>${Math.round(p.calorie)} kcal</span>
                        <span class="pasto-tag"><i data-lucide="dumbbell" class="w-3 h-3 text-blue-400"></i>${Math.round(p.proteine)}g P</span>
                        <span class="pasto-tag"><i data-lucide="wheat" class="w-3 h-3 text-emerald-400"></i>${Math.round(p.carboidrati)}g C</span>
                        <span class="pasto-tag"><i data-lucide="droplet" class="w-3 h-3 text-amber-400"></i>${Math.round(p.grassi)}g G</span>
                    </div>
                </div>`;
                    });
                } else {
                    pastiHtml = `<p class="text-xs text-slate-500 italic py-1 pl-1">${currentLang === 'en' ? 'No individual meals recorded (totals or weight only).' : 'Nessun singolo pasto registrato (solo macro totali o peso).'}</p>`;
                }

                html += `
        <div class="entry-card bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 shadow-xl">
            <div class="flex justify-between items-center mb-3 border-b border-slate-700/40 pb-2.5">
                <div class="flex items-center gap-2">
                    <span class="text-xs font-bold text-slate-300">${giorno.data}</span>
                    ${giorno.peso 
                        ? `<button onclick="modificaPesoDelGiorno(${giorno.id})" class="text-[10px] bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition" title="${currentLang === 'en' ? 'Edit weight' : 'Modifica peso'}"><i data-lucide="scale" class="w-3 h-3"></i> ${giorno.peso} kg <i data-lucide="pencil" class="w-2 h-2 opacity-60"></i></button>` 
                        : `<button onclick="modificaPesoDelGiorno(${giorno.id})" class="text-[10px] bg-slate-700/30 hover:bg-slate-700/60 text-slate-400 border border-slate-700/30 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition" title="${currentLang === 'en' ? 'Add weight' : 'Aggiungi peso'}"><i data-lucide="plus" class="w-3 h-3"></i> ${currentLang === 'en' ? 'Add weight' : 'Aggiungi peso'}</button>`
                    }
                </div>
                <button onclick="eliminaInteroGiorno(${giorno.id || 0})" class="text-slate-500 hover:text-rose-400 transition p-1" title="Elimina intero giorno">
                    <i data-lucide="calendar-x" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="space-y-2.5">
                ${pastiHtml}
            </div>
        </div>`;
            });

            lista.innerHTML = html;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        // ================================================================
        // ELIMINAZIONI ED EDITING MODAL STORICO
        // ================================================================
        function modificaPesoDelGiorno(giornoId) {
            editingGiornoId = giornoId;
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const giorno = db.find(g => g.id === giornoId);
            if (!giorno) return;

            // Imposta i testi in base alla lingua
            const titleEl = document.getElementById('weightModalTitle');
            if (titleEl) titleEl.innerText = currentLang === 'en' ? "Edit Weight" : "Modifica Peso";
            const labelEl = document.getElementById('weightModalLabel');
            if (labelEl) labelEl.innerText = currentLang === 'en' ? `Weight for ${giorno.data} (kg)` : `Peso per il giorno ${giorno.data} (kg)`;
            const hintEl = document.getElementById('weightModalHint');
            if (hintEl) hintEl.innerText = currentLang === 'en' ? "Leave empty to remove the weight." : "Lascia vuoto per rimuovere il peso.";

            const inputEl = document.getElementById('weightModalInput');
            if (inputEl) {
                inputEl.value = (giorno.peso !== undefined && giorno.peso !== null) ? giorno.peso : "";
            }

            const m = document.getElementById('modalWeightEdit');
            m.classList.remove('hidden');
            setTimeout(() => {
                const inner = document.getElementById('modalWeightInner');
                inner.style.transform = "translateY(0)";
                inner.style.opacity = "1";
            }, 50);
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        function chiudiModalPeso() {
            const inner = document.getElementById('modalWeightInner');
            inner.style.transform = "translateY(100%)";
            inner.style.opacity = "0";
            setTimeout(() => {
                document.getElementById('modalWeightEdit').classList.add('hidden');
                editingGiornoId = null;
            }, 200);
        }

        async function salvaModalPeso() {
            if (!editingGiornoId) return;
            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            let giorno = db.find(g => g.id === editingGiornoId);
            if (!giorno) {
                chiudiModalPeso();
                return;
            }

            const inputVal = document.getElementById('weightModalInput').value.trim();

            if (inputVal === "") {
                // Rimuove il peso
                delete giorno.peso;
                localStorage.setItem('nutriDB', JSON.stringify(db));
                chiudiModalPeso();
                await customAlert(
                    currentLang === 'en' ? "Weight Removed" : "Peso rimosso", 
                    currentLang === 'en' ? "Weight has been successfully removed for this day." : "Il peso è stato rimosso correttamente per questo giorno.", 
                    true
                );
                renderStorico();
                // Se i pannelli Trend sono attivi, li aggiorna
                if (document.getElementById('panel-trend').classList.contains('active')) {
                    if (trendView === 'mesi') {
                        renderTrendMensile();
                    } else {
                        renderTrend();
                    }
                }
                caricaPesoDelGiorno();
            } else {
                const nuovoPeso = parseFloat(inputVal);
                if (isNaN(nuovoPeso) || nuovoPeso <= 0) {
                    await customAlert(
                        currentLang === 'en' ? "Invalid Value" : "Valore non valido", 
                        currentLang === 'en' ? "Please enter a valid weight number." : "Inserisci un numero di peso valido."
                    );
                    return;
                }

                // Salva il peso
                giorno.peso = parseFloat(nuovoPeso.toFixed(1));
                localStorage.setItem('nutriDB', JSON.stringify(db));
                chiudiModalPeso();
                await customAlert(
                    currentLang === 'en' ? "Weight Saved" : "Peso salvato", 
                    currentLang === 'en' ? `Weight updated to ${giorno.peso} kg.` : `Peso aggiornato a ${giorno.peso} kg.`, 
                    true
                );
                renderStorico();
                // Se i pannelli Trend sono attivi, li aggiorna
                if (document.getElementById('panel-trend').classList.contains('active')) {
                    if (trendView === 'mesi') {
                        renderTrendMensile();
                    } else {
                        renderTrend();
                    }
                }
                caricaPesoDelGiorno();
            }
        }

        async function eliminaInteroGiorno(giornoId) {
            const procedi = await customConfirm(
                currentLang === 'en' ? "Delete Day" : "Elimina Giornata",
                currentLang === 'en' ? "Are you sure you want to completely delete this day from the diary?" : "Sei sicuro di voler eliminare interamente questa giornata dal diario?",
                true,
                currentLang === 'en' ? "Delete" : "Elimina"
            );
            if (!procedi) return;
            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            db = db.filter(x => x.id !== giornoId);
            salvaDatabase(db);
            renderStorico();
            aggiornaTotaleGiorno();
            caricaPesoDelGiorno();
        }

        async function eliminaSingoloPasto(giornoId, pastoId) {
            const procedi = await customConfirm(
                currentLang === 'en' ? "Delete Meal" : "Elimina Pasto",
                currentLang === 'en' ? "Delete this meal? Daily macros will be recalculated." : "Eliminare questo pasto? I macro giornalieri verranno ricalcolati.",
                true,
                currentLang === 'en' ? "Delete" : "Elimina"
            );
            if (!procedi) return;
            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            let giorno = db.find(x => x.id === giornoId);
            if (giorno) {
                const pasto = giorno.pasti.find(p => p.id === pastoId);
                if (pasto) {
                    giorno.calorie = Math.max(0, giorno.calorie - pasto.calorie);
                    giorno.proteine = Math.max(0, giorno.proteine - pasto.proteine);
                    giorno.carboidrati = Math.max(0, giorno.carboidrati - pasto.carboidrati);
                    giorno.grassi = Math.max(0, giorno.grassi - pasto.grassi);
                }
                giorno.pasti = giorno.pasti.filter(p => p.id !== pastoId);
                if (giorno.pasti.length === 0 && !giorno.peso) {
                    db = db.filter(x => x.id !== giornoId);
                }
            }
            salvaDatabase(db);
            renderStorico();
            aggiornaTotaleGiorno();
        }

        function apriModalModifica(giornoId, pastoId) {
            editingId = { giornoId, pastoId };
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            const giorno = db.find(x => x.id === giornoId);
            if (giorno) {
                const pasto = giorno.pasti.find(p => p.id === pastoId);
                if (pasto) {
                    document.getElementById('editData').value = giorno.data;
                    document.getElementById('editOra').value = pasto.ora || "12:00";
                    document.getElementById('editTesto').value = pasto.testo;

                    const m = document.getElementById('modalEdit');
                    m.classList.remove('hidden');
                    setTimeout(() => {
                        document.getElementById('modalInner').style.transform = "translateY(0)";
                        document.getElementById('modalInner').style.opacity = "1";
                    }, 50);
                }
            }
            lucide.createIcons();
        }

        function chiudiModal() {
            document.getElementById('modalInner').style.transform = "translateY(100%)";
            document.getElementById('modalInner').style.opacity = "0";
            setTimeout(() => {
                document.getElementById('modalEdit').classList.add('hidden');
                editingId = null;
            }, 200);
        }

        async function salvaModifica() {
            if (!editingId) return;
            const { giornoId, pastoId } = editingId;

            const nuovaData = document.getElementById('editData').value;
            const nuovaOra = document.getElementById('editOra').value;
            const nuovoTesto = document.getElementById('editTesto').value.trim();

            if (!nuovoTesto || !nuovaData) {
                await customAlert("Campi incompleti", currentLang === 'en' ? "Please fill in all required fields!" : "Compila i campi richiesti!");
                return;
            }
            const apiKey = localStorage.getItem('gemini_apikey');
            if (!apiKey) {
                await customAlert("API Key mancante", currentLang === 'en' ? "Please insert your Gemini API Key in the settings first!" : "Gemini API Key mancante nelle impostazioni!");
                return;
            }

            const btn = document.getElementById('btnSalvaModifica');
            btn.disabled = true;
            btn.innerText = currentLang === 'en' ? "Recalculating with AI..." : "Ricalcolo in corso AI...";

            const prof = ottieniProfiloUtente();
            const promptSistema = currentLang === 'en'
                ? `You are an expert nutritionist. Analyze the user text containing foods. Calculate total Calories, Proteins (g), Carbohydrates (g), Fats (g). Respond ONLY with a valid JSON object (no markdown, do not wrap in \`\`\`json block) with the following numerical keys: "calorie", "proteine", "carboidrati", "grassi". Be realistic and precise in the estimates.
IMPORTANT: If the user does not specify portions, weights, or quantities for a food item, you MUST calculate a moderate, standard portion suitable for a single person with the user's characteristics: biological sex ${prof.sesso}, age ${prof.eta || '30'} years old, weight ${prof.peso || '75'} kg, height ${prof.altezza || '175'} cm, and daily target of ${prof.targetCalorie || '2000'} kcal. Adjust estimates conservatively based on these parameters rather than high-balling.`
                : `Sei un esperto nutrizionista. Analizza il testo inserito dall'utente contenente alimenti. Calcola Calorie totali, Proteine (g), Carboidrati (g), Grassi (g). Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown, senza racchiuderlo in codice tipo \`\`\`json) avente le seguenti chiavi numeriche: "calorie", "proteine", "carboidrati", "grassi". Sii realistico e preciso nelle stime.
IMPORTANTE: Se l'utente non specifica le porzioni, pesi o quantità per un alimento, devi considerare e stimare una porzione standard moderata adatta a una singola persona con le caratteristiche fisiche dell'utente: sesso biologico ${prof.sesso}, età ${prof.eta || '30'} anni, peso ${prof.peso || '75'} kg, altezza ${prof.altezza || '175'} cm, fabbisogno calorico target giornaliero di ${prof.targetCalorie || '2000'} kcal. Regola le stime in modo conservativo basandoti su questi parametri, evitando sovrastime.`;

            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptSistema + "\n\n" + (currentLang === 'en' ? "User text to analyze:" : "Testo utente da analizzare:") + "\n" + nuovoTesto }] }],
                        generationConfig: { responseMimeType: "application/json", temperature: 0.2 }
                    })
                });
                if (!response.ok) throw new Error("Risposta del server non valida da Gemini");
                const jsonRes = JSON.parse((await response.json()).candidates[0].content.parts[0].text.trim());

                let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
                let vecchioGiorno = db.find(x => x.id === giornoId);

                if (vecchioGiorno) {
                    let vecchioPasto = vecchioGiorno.pasti.find(p => p.id === pastoId);
                    if (vecchioPasto) {
                        vecchioGiorno.calorie = Math.max(0, vecchioGiorno.calorie - vecchioPasto.calorie);
                        vecchioGiorno.proteine = Math.max(0, vecchioGiorno.proteine - vecchioPasto.proteine);
                        vecchioGiorno.carboidrati = Math.max(0, vecchioGiorno.carboidrati - vecchioPasto.carboidrati);
                        vecchioGiorno.grassi = Math.max(0, vecchioGiorno.grassi - vecchioPasto.grassi);
                        vecchioGiorno.pasti = vecchioGiorno.pasti.filter(p => p.id !== pastoId);
                    }
                    if (vecchioGiorno.pasti.length === 0 && !vecchioGiorno.peso) {
                        db = db.filter(x => x.id !== giornoId);
                    }
                }

                const pastoModificato = {
                    id: pastoId,
                    ora: nuovaOra,
                    testo: nuovoTesto,
                    calorie: jsonRes.calorie || 0,
                    proteine: jsonRes.proteine || 0,
                    carboidrati: jsonRes.carboidrati || 0,
                    grassi: jsonRes.grassi || 0
                };

                let destinazioneGiorno = db.find(x => x.data === nuovaData);
                if (destinazioneGiorno) {
                    destinazioneGiorno.calorie = (destinazioneGiorno.calorie || 0) + pastoModificato.calorie;
                    destinazioneGiorno.proteine = (destinazioneGiorno.proteine || 0) + pastoModificato.proteine;
                    destinazioneGiorno.carboidrati = (destinazioneGiorno.carboidrati || 0) + pastoModificato.carboidrati;
                    destinazioneGiorno.grassi = (destinazioneGiorno.grassi || 0) + pastoModificato.grassi;
                    if (!destinazioneGiorno.pasti) destinazioneGiorno.pasti = [];
                    destinazioneGiorno.pasti.push(pastoModificato);
                } else {
                    db.push({
                        id: Date.now(),
                        data: nuovaData,
                        calorie: pastoModificato.calorie,
                        proteine: pastoModificato.proteine,
                        carboidrati: pastoModificato.carboidrati,
                        grassi: pastoModificato.grassi,
                        pasti: [pastoModificato],
                        peso: null
                    });
                }

                salvaDatabase(db);
                chiudiModal();
                renderStorico();
                aggiornaTotaleGiorno();
                caricaPesoDelGiorno();
            } catch (err) {
                console.error(err);
                await customAlert("Errore", currentLang === 'en' ? "Error during update." : "Errore durante la modifica.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4"></i> ${currentLang === 'en' ? 'Recalculate & Save' : 'Ricalcola e Salva'}`;
                lucide.createIcons();
            }
        }

        async function confermaReset() {
            const procedi = await customConfirm(currentLang === 'en' ? "Delete Database" : "Cancellazione Database", currentLang === 'en' ? "WARNING! Do you really want to delete the entire local database of meals and weight? This action is irreversible." : "ATTENZIONE! Vuoi davvero cancellare l'intero database locale dei pasti e del peso? Questa azione è irreversibile.", true, currentLang === 'en' ? "Delete all" : "Cancella tutto");
            if (procedi) {
                localStorage.removeItem('nutriDB');
                autoSalvaNelFileLocale();
                renderStorico();
                aggiornaTotaleGiorno();
                caricaPesoDelGiorno();
                await customAlert(currentLang === 'en' ? "Deleted" : "Cancellato", currentLang === 'en' ? "The entire database has been successfully reset." : "L'intero database è stato resettato correttamente.", true);
            }
        }

        function aggiornaGauge(chartKey, canvasId, valore, target, coloreChiaro, coloreScuro, unita) {
            const canvasEl = document.getElementById(canvasId);
            if (!canvasEl) return null;
            
            const safeTarget = target > 0 ? target : 2000;
            const maxVal = 2 * safeTarget;
            const safeVal = Math.max(0, valore || 0);
            
            const activeVal = Math.min(safeVal, maxVal);
            const remainVal = Math.max(0, maxVal - activeVal);
            
            const activeColor = safeVal > safeTarget ? coloreScuro : coloreChiaro;
            
            let chartInstance = window[chartKey];
            if (chartInstance) {
                chartInstance.destroy();
            }
            
            const ctx = canvasEl.getContext('2d');
            chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [activeVal, remainVal],
                        backgroundColor: [activeColor, 'rgba(51, 65, 85, 0.25)'],
                        borderWidth: 0,
                        weight: 1
                    }]
                },
                options: {
                    circumference: 180,
                    rotation: 270,
                    cutout: '80%',
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: {
                            top: 15,
                            bottom: 2,
                            left: 2,
                            right: 2
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: { enabled: false }
                    }
                },
                plugins: [{
                    id: 'targetLine',
                    afterDraw(chart) {
                        const { ctx, chartArea: { left, right, bottom } } = chart;
                        const x = (left + right) / 2;
                        const y = bottom;
                        
                        const outerRadius = chart.outerRadius;
                        const innerRadius = chart.innerRadius;

                        ctx.save();
                        
                        // 1. Draw a prominent target tick line at the top center
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(x, y - innerRadius + 1);
                        ctx.lineTo(x, y - outerRadius - 3);
                        ctx.stroke();

                        // 2. Draw a small downward pointing triangle/pin
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(x - 3.5, y - outerRadius - 3);
                        ctx.lineTo(x + 3.5, y - outerRadius - 3);
                        ctx.lineTo(x, y - outerRadius);
                        ctx.fill();

                        // 3. Write target text with units (e.g. "2000 kcal") above the indicator
                        ctx.fillStyle = '#94a3b8';
                        ctx.font = "bold 7px 'Outfit', sans-serif";
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(safeTarget + unita, x, y - outerRadius - 5);

                        ctx.restore();
                    }
                }]
            });
            
            window[chartKey] = chartInstance;
            return chartInstance;
        }

        function aggiornaGauges(avgCal, avgProt, avgCarb, avgFat) {
            if (avgCal !== null && avgCal !== undefined) {
                document.getElementById('mediaCalorie').innerText = avgCal;
                const percent = targetCalorie > 0 ? Math.round((avgCal / targetCalorie) * 100) : 0;
                const pctEl = document.getElementById('mediaCaloriePercent');
                pctEl.innerText = percent + '%';
                pctEl.style.color = avgCal > targetCalorie ? '#ef4444' : '#10b981';
                aggiornaGauge('gaugeCalorieChart', 'gaugeCalorie', avgCal, targetCalorie, 'rgba(244, 63, 94, 0.85)', 'rgba(136, 19, 55, 0.85)', ' kcal');
            } else {
                document.getElementById('mediaCalorie').innerText = '—';
                document.getElementById('mediaCaloriePercent').innerText = '—';
                if (window.gaugeCalorieChart) window.gaugeCalorieChart.destroy();
            }

            if (avgProt !== null && avgProt !== undefined) {
                document.getElementById('mediaProteine').innerText = avgProt;
                const percent = targetProteine > 0 ? Math.round((avgProt / targetProteine) * 100) : 0;
                const pctEl = document.getElementById('mediaProteinePercent');
                pctEl.innerText = percent + '%';
                pctEl.style.color = avgProt > targetProteine ? '#3b82f6' : '#10b981';
                aggiornaGauge('gaugeProteineChart', 'gaugeProteine', avgProt, targetProteine, 'rgba(59, 130, 246, 0.85)', 'rgba(30, 58, 138, 0.85)', 'g');
            } else {
                document.getElementById('mediaProteine').innerText = '—';
                document.getElementById('mediaProteinePercent').innerText = '—';
                if (window.gaugeProteineChart) window.gaugeProteineChart.destroy();
            }

            if (avgCarb !== null && avgCarb !== undefined) {
                document.getElementById('mediaCarbo').innerText = avgCarb;
                const percent = targetCarbo > 0 ? Math.round((avgCarb / targetCarbo) * 100) : 0;
                const pctEl = document.getElementById('mediaCarboPercent');
                pctEl.innerText = percent + '%';
                pctEl.style.color = avgCarb > targetCarbo ? '#10b981' : '#10b981';
                aggiornaGauge('gaugeCarboChart', 'gaugeCarbo', avgCarb, targetCarbo, 'rgba(16, 185, 129, 0.85)', 'rgba(6, 78, 59, 0.85)', 'g');
            } else {
                document.getElementById('mediaCarbo').innerText = '—';
                document.getElementById('mediaCarboPercent').innerText = '—';
                if (window.gaugeCarboChart) window.gaugeCarboChart.destroy();
            }

            if (avgFat !== null && avgFat !== undefined) {
                document.getElementById('mediaGrassi').innerText = avgFat;
                const percent = targetGrassi > 0 ? Math.round((avgFat / targetGrassi) * 100) : 0;
                const pctEl = document.getElementById('mediaGrassiPercent');
                pctEl.innerText = percent + '%';
                pctEl.style.color = avgFat > targetGrassi ? '#f59e0b' : '#10b981';
                aggiornaGauge('gaugeGrassiChart', 'gaugeGrassi', avgFat, targetGrassi, 'rgba(245, 158, 11, 0.85)', 'rgba(120, 53, 15, 0.85)', 'g');
            } else {
                document.getElementById('mediaGrassi').innerText = '—';
                document.getElementById('mediaGrassiPercent').innerText = '—';
                if (window.gaugeGrassiChart) window.gaugeGrassiChart.destroy();
            }
        }

        // ================================================================
        // LOGICA DI RENDERING GRAFICI E TREND (7 GIORNI E 8 SETTIMANE)
        // ================================================================
        function renderTrend() {
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];

            const titleEl = document.getElementById('trendMediaTitle');

            const calcolaBarraETarget = (attuale, target) => {
                if (!target || target <= 0) return { barra: '0%', freccia: '100%' };
                if (attuale > target) {
                    return {
                        barra: '100%',
                        freccia: ((target / attuale) * 100) + '%'
                    };
                } else {
                    return {
                        barra: ((attuale / target) * 100) + '%',
                        freccia: '100%'
                    };
                }
            };

            if (trendView === 'giorni') {
                if (titleEl) {
                    titleEl.innerText = currentLang === 'en' ? 'Overall Average (7 days)' : 'Media complessiva (7 giorni)';
                }
                const etichetteGiorni = [];
                const ultimiGiorni = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const costr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    etichetteGiorni.push(String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0'));

                    const trovato = db.find(x => x.data === costr);
                    if (trovato) {
                        ultimiGiorni.push(trovato);
                    } else {
                        ultimiGiorni.push({ data: costr, calorie: 0, proteine: 0, carboidrati: 0, grassi: 0, peso: null });
                    }
                }

                const giorniAttivi = ultimiGiorni.filter(g => g.calorie > 0 || g.proteine > 0 || g.carboidrati > 0 || g.grassi > 0);
                if (giorniAttivi.length > 0) {
                    const sum = (chiave) => giorniAttivi.reduce((acc, current) => acc + (current[chiave] || 0), 0);
                    const avgCal = Math.round(sum('calorie') / giorniAttivi.length);
                    const avgProt = Math.round(sum('proteine') / giorniAttivi.length);
                    const avgCarb = Math.round(sum('carboidrati') / giorniAttivi.length);
                    const avgFat = Math.round(sum('grassi') / giorniAttivi.length);

                    aggiornaGauges(avgCal, avgProt, avgCarb, avgFat);
                } else {
                    aggiornaGauges(null, null, null, null);
                }

                if (trendCalorieChart) trendCalorieChart.destroy();
                if (trendPesoChart) trendPesoChart.destroy();

                let pTarget = parseFloat(localStorage.getItem('targetPeso')) || 75;
                const arrayPesi = ultimiGiorni.map(g => g.peso).filter(p => p !== null && p !== undefined && p > 0);
                
                let pesoScales;
                if (arrayPesi.length > 0) {
                    const tuttiIValori = [...arrayPesi, pTarget];
                    pesoScales = calcolaLimitiAsseY(Math.min(...tuttiIValori), Math.max(...tuttiIValori), false);
                } else {
                    pesoScales = calcolaLimitiAsseY(pTarget - 2, pTarget + 2, false);
                }
                const yMin = pesoScales.min;
                const yMax = pesoScales.max;
                const pesoStepSize = pesoScales.stepSize;

                const maxCal = Math.max(...ultimiGiorni.map(g => g.calorie), targetCalorie);
                const calorieScales = calcolaLimitiAsseY(0, maxCal, true);
                const maxCalValue = calorieScales.max;
                const calorieStepSize = calorieScales.stepSize;

                // 1. Grafico Calorie e Macronutrienti (Top)
                trendCalorieChart = new Chart(document.getElementById('trendCalorieChart').getContext('2d'), {
                    plugins: [macroStatusLightsPlugin],
                    data: {
                        labels: etichetteGiorni,
                        customRawData: ultimiGiorni,
                        customTargets: {
                            calorie: targetCalorie,
                            proteine: targetProteine,
                            carboidrati: targetCarbo,
                            grassi: targetGrassi
                        },
                        datasets: [
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Fats' : 'Grassi',
                                data: ultimiGiorni.map(g => Math.round((g.grassi || 0) * 9)),
                                backgroundColor: 'rgba(245, 158, 11, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Carbs' : 'Carboidrati',
                                data: ultimiGiorni.map(g => Math.round((g.carboidrati || 0) * 4)),
                                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Proteins' : 'Proteine',
                                data: ultimiGiorni.map(g => Math.round((g.proteine || 0) * 4)),
                                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Calories Target' : 'Target Calorie',
                                data: etichetteGiorni.map(() => targetCalorie),
                                borderColor: '#f43f5e',
                                borderWidth: 1.5,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    color: '#94a3b8',
                                    boxWidth: 10,
                                    font: { size: 9, family: "'Outfit', sans-serif" },
                                    filter: function (item) {
                                        return !item.text.includes('Target');
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const idx = context.dataIndex;
                                        const dsIdx = context.datasetIndex;
                                        const rawData = context.chart.config.data.customRawData;
                                        const targets = context.chart.config.data.customTargets;
                                        const item = rawData[idx];
                                        if (!item) return '';
                                        if (dsIdx === 0) return (currentLang === 'en' ? 'Fats: ' : 'Grassi: ') + Math.round(item.grassi || 0) + 'g / ' + targets.grassi + 'g';
                                        if (dsIdx === 1) return (currentLang === 'en' ? 'Carbs: ' : 'Carboidrati: ') + Math.round(item.carboidrati || 0) + 'g / ' + targets.carboidrati + 'g';
                                        if (dsIdx === 2) return (currentLang === 'en' ? 'Proteins: ' : 'Proteine: ') + Math.round(item.proteine || 0) + 'g / ' + targets.proteine + 'g';
                                        if (dsIdx === 3) return (currentLang === 'en' ? 'Calories Target: ' : 'Target Calorie: ') + targets.calorie + ' kcal';
                                        return '';
                                    }
                                }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                stacked: true,
                                grid: { color: 'rgba(71,85,105,0.08)', drawTicks: false },
                                ticks: { display: false }
                            },
                            y: {
                                stacked: true,
                                type: 'linear',
                                position: 'left',
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { 
                                    color: '#f43f5e', 
                                    font: { size: 9, weight: 'bold' },
                                    stepSize: calorieStepSize
                                },
                                min: 0,
                                max: maxCalValue,
                                title: {
                                    display: true,
                                    text: currentLang === 'en' ? 'Calories (kcal)' : 'Calorie (kcal)',
                                    color: '#f43f5e',
                                    font: { size: 9, weight: 'bold' }
                                },
                                afterFit: (scale) => { scale.width = 50; }
                            }
                        }
                    }
                });

                // 2. Grafico Peso Corporeo (Bottom)
                trendPesoChart = new Chart(document.getElementById('trendPesoChart').getContext('2d'), {
                    data: {
                        labels: etichetteGiorni,
                        customRawData: ultimiGiorni,
                        datasets: [
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Weight' : 'Peso Reale',
                                data: ultimiGiorni.map(g => g.peso),
                                borderColor: '#6366f1',
                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                borderWidth: 3,
                                pointRadius: 3,
                                pointBackgroundColor: '#6366f1',
                                fill: false,
                                spanGaps: true,
                                yAxisID: 'y'
                            },
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Weight Target' : 'Obiettivo Peso',
                                data: etichetteGiorni.map(() => pTarget),
                                borderColor: '#6366f1',
                                borderWidth: 1.5,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const idx = context.dataIndex;
                                        const dsIdx = context.datasetIndex;
                                        const rawData = context.chart.config.data.customRawData;
                                        const item = rawData[idx];
                                        if (!item) return '';
                                        if (dsIdx === 0) return (currentLang === 'en' ? 'Weight: ' : 'Peso: ') + (item.peso ? item.peso + ' kg' : '--');
                                        if (dsIdx === 1) return (currentLang === 'en' ? 'Weight Target: ' : 'Obiettivo Peso: ') + pTarget + ' kg';
                                        return '';
                                    }
                                }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { color: '#64748b', font: { size: 9 } }
                            },
                            y: {
                                type: 'linear',
                                position: 'left',
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { 
                                    color: '#6366f1', 
                                    font: { size: 9, weight: 'bold' },
                                    stepSize: pesoStepSize
                                },
                                min: yMin,
                                max: yMax,
                                title: {
                                    display: true,
                                    text: currentLang === 'en' ? 'Weight (kg)' : 'Peso (kg)',
                                    color: '#6366f1',
                                    font: { size: 9, weight: 'bold' }
                                },
                                afterFit: (scale) => { scale.width = 50; }
                            }
                        }
                    }
                });
            } else {
                if (titleEl) {
                    titleEl.innerText = currentLang === 'en' ? 'Overall Average (8 weeks)' : 'Media complessiva (8 settimane)';
                }
                const etichetteSettimane = [];
                const datiSettimane = [];
                const getWeekNumber = (date) => {
                    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                    const dayNum = d.getUTCDay() || 7;
                    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
                };
                const formattaData = (d) => {
                    const anno = d.getFullYear();
                    const mese = String(d.getMonth() + 1).padStart(2, '0');
                    const giorno = String(d.getDate()).padStart(2, '0');
                    return `${anno}-${mese}-${giorno}`;
                };
                const lunedìCorrente = new Date();
                const day = lunedìCorrente.getDay();
                const diff = day === 0 ? 6 : day - 1;
                lunedìCorrente.setDate(lunedìCorrente.getDate() - diff);
                lunedìCorrente.setHours(0, 0, 0, 0);
                for (let w = 7; w >= 0; w--) {
                    const inizioSettimana = new Date(lunedìCorrente);
                    inizioSettimana.setDate(lunedìCorrente.getDate() - (w * 7));
                    const fineSettimana = new Date(inizioSettimana);
                    fineSettimana.setDate(inizioSettimana.getDate() + 6);
                    const numSettimana = getWeekNumber(inizioSettimana);
                    etichetteSettimane.push(numSettimana);
                    const inizioStr = formattaData(inizioSettimana);
                    const fineStr = formattaData(fineSettimana);
                    const recordSettimanali = db.filter(x => x.data >= inizioStr && x.data <= fineStr);
                    const recordAttivi = recordSettimanali.filter(r => r.calorie > 0 || r.proteine > 0 || r.carboidrati > 0 || r.grassi > 0);
                    const recordConPeso = recordSettimanali.filter(r => r.peso !== null && r.peso !== undefined && parseFloat(r.peso) > 0);
                    const mediaC = recordAttivi.length > 0 ? recordAttivi.reduce((a, b) => a + (b.calorie || 0), 0) / recordAttivi.length : 0;
                    const mediaP = recordAttivi.length > 0 ? recordAttivi.reduce((a, b) => a + (b.proteine || 0), 0) / recordAttivi.length : 0;
                    const mediaCb = recordAttivi.length > 0 ? recordAttivi.reduce((a, b) => a + (b.carboidrati || 0), 0) / recordAttivi.length : 0;
                    const mediaG = recordAttivi.length > 0 ? recordAttivi.reduce((a, b) => a + (b.grassi || 0), 0) / recordAttivi.length : 0;
                    const mediaPeso = recordConPeso.length > 0 ? recordConPeso.reduce((a, b) => a + parseFloat(b.peso), 0) / recordConPeso.length : null;
                    datiSettimane.push({ calorie: mediaC, proteine: mediaP, carboidrati: mediaCb, grassi: mediaG, peso: mediaPeso });
                }
                const settimaneAttive = datiSettimane.filter(s => s.calorie > 0 || s.proteine > 0);
                if (settimaneAttive.length > 0) {
                    const avgCal = Math.round(settimaneAttive.reduce((a, b) => a + b.calorie, 0) / settimaneAttive.length);
                    const avgProt = Math.round(settimaneAttive.reduce((a, b) => a + b.proteine, 0) / settimaneAttive.length);
                    const avgCarb = Math.round(settimaneAttive.reduce((a, b) => a + b.carboidrati, 0) / settimaneAttive.length);
                    const avgFat = Math.round(settimaneAttive.reduce((a, b) => a + b.grassi, 0) / settimaneAttive.length);
                    
                    aggiornaGauges(avgCal, avgProt, avgCarb, avgFat);
                } else {
                    aggiornaGauges(null, null, null, null);
                }

                if (weekCalorieChart) weekCalorieChart.destroy();
                if (weekPesoChart) weekPesoChart.destroy();

                let pTarget = parseFloat(localStorage.getItem('targetPeso')) || 75;
                const arrayPesi = datiSettimane.map(s => s.peso).filter(p => p !== null && p !== undefined && p > 0);
                
                let pesoScales;
                if (arrayPesi.length > 0) {
                    const tuttiIValori = [...arrayPesi, pTarget];
                    pesoScales = calcolaLimitiAsseY(Math.min(...tuttiIValori), Math.max(...tuttiIValori), false);
                } else {
                    pesoScales = calcolaLimitiAsseY(pTarget - 2, pTarget + 2, false);
                }
                const yMin = pesoScales.min;
                const yMax = pesoScales.max;
                const pesoStepSize = pesoScales.stepSize;

                const maxCal = Math.max(...datiSettimane.map(s => s.calorie), targetCalorie);
                const calorieScales = calcolaLimitiAsseY(0, maxCal, true);
                const maxCalValue = calorieScales.max;
                const calorieStepSize = calorieScales.stepSize;

                // 1. Grafico Calorie e Macronutrienti (Top)
                weekCalorieChart = new Chart(document.getElementById('weekCalorieChart').getContext('2d'), {
                    plugins: [macroStatusLightsPlugin],
                    data: {
                        labels: etichetteSettimane,
                        customRawData: datiSettimane,
                        customTargets: {
                            calorie: targetCalorie,
                            proteine: targetProteine,
                            carboidrati: targetCarbo,
                            grassi: targetGrassi
                        },
                        datasets: [
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Fats' : 'Grassi',
                                data: datiSettimane.map(s => Math.round((s.grassi || 0) * 9)),
                                backgroundColor: 'rgba(245, 158, 11, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Carbs' : 'Carboidrati',
                                data: datiSettimane.map(s => Math.round((s.carboidrati || 0) * 4)),
                                backgroundColor: 'rgba(16, 185, 129, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'bar',
                                label: currentLang === 'en' ? 'Proteins' : 'Proteine',
                                data: datiSettimane.map(s => Math.round((s.proteine || 0) * 4)),
                                backgroundColor: 'rgba(59, 130, 246, 0.75)',
                                borderRadius: 4,
                                yAxisID: 'y',
                                stack: 'calories'
                            },
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Calories Target' : 'Target Calorie',
                                data: etichetteSettimane.map(() => targetCalorie),
                                borderColor: '#f43f5e',
                                borderWidth: 1.5,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: true,
                                position: 'top',
                                labels: {
                                    color: '#94a3b8',
                                    boxWidth: 10,
                                    font: { size: 9, family: "'Outfit', sans-serif" },
                                    filter: function (item) {
                                        return !item.text.includes('Target');
                                    }
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const idx = context.dataIndex;
                                        const dsIdx = context.datasetIndex;
                                        const rawData = context.chart.config.data.customRawData;
                                        const targets = context.chart.config.data.customTargets;
                                        const item = rawData[idx];
                                        if (!item) return '';
                                        if (dsIdx === 0) return (currentLang === 'en' ? 'Fats: ' : 'Grassi: ') + Math.round(item.grassi || 0) + 'g / ' + targets.grassi + 'g';
                                        if (dsIdx === 1) return (currentLang === 'en' ? 'Carbs: ' : 'Carboidrati: ') + Math.round(item.carboidrati || 0) + 'g / ' + targets.carboidrati + 'g';
                                        if (dsIdx === 2) return (currentLang === 'en' ? 'Proteins: ' : 'Proteine: ') + Math.round(item.proteine || 0) + 'g / ' + targets.proteine + 'g';
                                        if (dsIdx === 3) return (currentLang === 'en' ? 'Calories Target: ' : 'Target Calorie: ') + targets.calorie + ' kcal';
                                        return '';
                                    }
                                }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                stacked: true,
                                grid: { color: 'rgba(71,85,105,0.08)', drawTicks: false },
                                ticks: { display: false }
                            },
                            y: {
                                stacked: true,
                                type: 'linear',
                                position: 'left',
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { 
                                    color: '#f43f5e', 
                                    font: { size: 9, weight: 'bold' },
                                    stepSize: calorieStepSize
                                },
                                min: 0,
                                max: maxCalValue,
                                title: {
                                    display: true,
                                    text: currentLang === 'en' ? 'Calories (kcal)' : 'Calorie (kcal)',
                                    color: '#f43f5e',
                                    font: { size: 9, weight: 'bold' }
                                },
                                afterFit: (scale) => { scale.width = 50; }
                            }
                        }
                    }
                });

                // 2. Grafico Peso Corporeo (Bottom)
                weekPesoChart = new Chart(document.getElementById('weekPesoChart').getContext('2d'), {
                    data: {
                        labels: etichetteSettimane,
                        customRawData: datiSettimane,
                        datasets: [
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Weight' : 'Peso Reale',
                                data: datiSettimane.map(s => s.peso),
                                borderColor: '#6366f1',
                                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                borderWidth: 3,
                                pointRadius: 3,
                                pointBackgroundColor: '#6366f1',
                                fill: false,
                                spanGaps: true,
                                yAxisID: 'y'
                            },
                            {
                                type: 'line',
                                label: currentLang === 'en' ? 'Weight Target' : 'Obiettivo Peso',
                                data: etichetteSettimane.map(() => pTarget),
                                borderColor: '#6366f1',
                                borderWidth: 1.5,
                                borderDash: [5, 5],
                                pointRadius: 0,
                                fill: false,
                                yAxisID: 'y'
                            }
                        ]
                    },
                    options: {
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const idx = context.dataIndex;
                                        const dsIdx = context.datasetIndex;
                                        const rawData = context.chart.config.data.customRawData;
                                        const item = rawData[idx];
                                        if (!item) return '';
                                        if (dsIdx === 0) return (currentLang === 'en' ? 'Weight: ' : 'Peso: ') + (item.peso ? item.peso.toFixed(1) + ' kg' : '--');
                                        if (dsIdx === 1) return (currentLang === 'en' ? 'Weight Target: ' : 'Obiettivo Peso: ') + pTarget + ' kg';
                                        return '';
                                    }
                                }
                            }
                        },
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: {
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { color: '#64748b', font: { size: 9 } }
                            },
                            y: {
                                type: 'linear',
                                position: 'left',
                                grid: { color: 'rgba(71,85,105,0.08)' },
                                ticks: { 
                                    color: '#6366f1', 
                                    font: { size: 9, weight: 'bold' },
                                    stepSize: pesoStepSize
                                },
                                min: yMin,
                                max: yMax,
                                title: {
                                    display: true,
                                    text: currentLang === 'en' ? 'Weight (kg)' : 'Peso (kg)',
                                    color: '#6366f1',
                                    font: { size: 9, weight: 'bold' }
                                },
                                afterFit: (scale) => { scale.width = 50; }
                            }
                        }
                    }
                });
            }
        }

        function renderTrendMensile() {
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];

            const calcolaBarraETarget = (attuale, target) => {
                if (!target || target <= 0) return { barra: '0%', freccia: '100%' };
                if (attuale > target) {
                    return {
                        barra: '100%',
                        freccia: ((target / attuale) * 100) + '%'
                    };
                } else {
                    return {
                        barra: ((attuale / target) * 100) + '%',
                        freccia: '100%'
                    };
                }
            };

            // 1. Pre-populate the last 12 calendar months to ensure months with no data are shown
            const grouped = {};
            const d = new Date();
            const currentYear = d.getFullYear();
            const currentMonth = d.getMonth(); // 0-11
            const monthKeys = [];

            for (let i = 11; i >= 0; i--) {
                let targetMonth = currentMonth - i;
                let targetYear = currentYear;
                while (targetMonth < 0) {
                    targetMonth += 12;
                    targetYear -= 1;
                }
                const monthStr = String(targetMonth + 1).padStart(2, '0');
                const key = `${targetYear}-${monthStr}`;
                monthKeys.push(key);
                grouped[key] = {
                    calorieSum: 0,
                    proteineSum: 0,
                    carboidratiSum: 0,
                    grassiSum: 0,
                    daysWithCal: 0,
                    pesoSum: 0,
                    daysWithPeso: 0
                };
            }

            // 2. Group by month
            db.forEach(entry => {
                if (!entry.data) return;
                const dateParts = entry.data.split('-');
                if (dateParts.length < 2) return;
                const key = `${dateParts[0]}-${dateParts[1]}`; // YYYY-MM

                // Only aggregate if the entry falls within the last 12 months
                if (grouped[key]) {
                    if (entry.calorie > 0 || entry.proteine > 0 || entry.carboidrati > 0 || entry.grassi > 0) {
                        grouped[key].calorieSum += (entry.calorie || 0);
                        grouped[key].proteineSum += (entry.proteine || 0);
                        grouped[key].carboidratiSum += (entry.carboidrati || 0);
                        grouped[key].grassiSum += (entry.grassi || 0);
                        grouped[key].daysWithCal += 1;
                    }

                    const pVal = parseFloat(entry.peso);
                    if (!isNaN(pVal) && pVal > 0) {
                        grouped[key].pesoSum += pVal;
                        grouped[key].daysWithPeso += 1;
                    }
                }
            });

            const labels = [];
            const datiPeso = [];
            const datiCalorie = [];
            const datiProteine = [];
            const datiCarboidrati = [];
            const datiGrassi = [];
            const datiMensili = [];

            monthKeys.forEach(key => {
                const parts = key.split('-');
                const anno = parts[0];
                const label = `${parts[1]}.${anno.substring(2)}`;
                labels.push(label);

                const mData = grouped[key];

                const avgCal = mData.daysWithCal > 0 ? Math.round(mData.calorieSum / mData.daysWithCal) : 0;
                const avgProt = mData.daysWithCal > 0 ? Math.round(mData.proteineSum / mData.daysWithCal) : 0;
                const avgCarb = mData.daysWithCal > 0 ? Math.round(mData.carboidratiSum / mData.daysWithCal) : 0;
                const avgFat = mData.daysWithCal > 0 ? Math.round(mData.grassiSum / mData.daysWithCal) : 0;
                const avgPeso = mData.daysWithPeso > 0 ? parseFloat((mData.pesoSum / mData.daysWithPeso).toFixed(1)) : null;

                datiCalorie.push(avgCal);
                datiProteine.push(avgProt);
                datiCarboidrati.push(avgCarb);
                datiGrassi.push(avgFat);
                datiPeso.push(avgPeso);

                datiMensili.push({
                    calorie: avgCal,
                    proteine: avgProt,
                    carboidrati: avgCarb,
                    grassi: avgFat,
                    peso: avgPeso
                });
            });

            // 3. Overall average on all active days of the database
            const giorniAttivi = db.filter(g => g.calorie > 0 || g.proteine > 0 || g.carboidrati > 0 || g.grassi > 0);
            const activeMonths = monthKeys.length;
            const titleEl = document.getElementById('trendMediaTitle');
            if (titleEl) {
                titleEl.innerText = currentLang === 'en'
                    ? `Overall Average (${activeMonths} months)`
                    : `Media complessiva (${activeMonths} ${activeMonths === 1 ? 'mese' : 'mesi'})`;
            }
            if (giorniAttivi.length > 0) {
                const sum = (chiave) => giorniAttivi.reduce((acc, current) => acc + (current[chiave] || 0), 0);
                const avgCal = Math.round(sum('calorie') / giorniAttivi.length);
                const avgProt = Math.round(sum('proteine') / giorniAttivi.length);
                const avgCarb = Math.round(sum('carboidrati') / giorniAttivi.length);
                const avgFat = Math.round(sum('grassi') / giorniAttivi.length);

                aggiornaGauges(avgCal, avgProt, avgCarb, avgFat);
            } else {
                aggiornaGauges(null, null, null, null);
            }

            // PESO, CALORIE & MACROS MENSILI SEPARATI
            if (monthCalorieChart) monthCalorieChart.destroy();
            if (monthPesoChart) monthPesoChart.destroy();

            let pTarget = parseFloat(localStorage.getItem('targetPeso')) || 75;
            const arrayPesi = datiPeso.filter(p => p !== null && p !== undefined && p > 0);
            
            let pesoScales;
            if (arrayPesi.length > 0) {
                const tuttiIValori = [...arrayPesi, pTarget];
                pesoScales = calcolaLimitiAsseY(Math.min(...tuttiIValori), Math.max(...tuttiIValori), false);
            } else {
                pesoScales = calcolaLimitiAsseY(pTarget - 2, pTarget + 2, false);
            }
            const yMin = pesoScales.min;
            const yMax = pesoScales.max;
            const pesoStepSize = pesoScales.stepSize;

            const maxCal = Math.max(...datiCalorie, targetCalorie);
            const calorieScales = calcolaLimitiAsseY(0, maxCal, true);
            const maxCalValue = calorieScales.max;
            const calorieStepSize = calorieScales.stepSize;

            // 1. Grafico Calorie e Macronutrienti (Top)
            monthCalorieChart = new Chart(document.getElementById('monthCalorieChart').getContext('2d'), {
                plugins: [macroStatusLightsPlugin],
                data: {
                    labels: labels,
                    customRawData: datiMensili,
                    customTargets: {
                        calorie: targetCalorie,
                        proteine: targetProteine,
                        carboidrati: targetCarbo,
                        grassi: targetGrassi
                    },
                    datasets: [
                        {
                            type: 'bar',
                            label: currentLang === 'en' ? 'Fats' : 'Grassi',
                            data: datiGrassi.map(g => Math.round((g || 0) * 9)),
                            backgroundColor: 'rgba(245, 158, 11, 0.75)',
                            borderRadius: 4,
                            yAxisID: 'y',
                            stack: 'calories'
                        },
                        {
                            type: 'bar',
                            label: currentLang === 'en' ? 'Carbs' : 'Carboidrati',
                            data: datiCarboidrati.map(c => Math.round((c || 0) * 4)),
                            backgroundColor: 'rgba(16, 185, 129, 0.75)',
                            borderRadius: 4,
                            yAxisID: 'y',
                            stack: 'calories'
                        },
                        {
                            type: 'bar',
                            label: currentLang === 'en' ? 'Proteins' : 'Proteine',
                            data: datiProteine.map(p => Math.round((p || 0) * 4)),
                            backgroundColor: 'rgba(59, 130, 246, 0.75)',
                            borderRadius: 4,
                            yAxisID: 'y',
                            stack: 'calories'
                        },
                        {
                            type: 'line',
                            label: currentLang === 'en' ? 'Calories Target' : 'Target Calorie',
                            data: labels.map(() => targetCalorie),
                            borderColor: '#f43f5e',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: '#94a3b8',
                                boxWidth: 10,
                                font: { size: 9, family: "'Outfit', sans-serif" },
                                filter: function (item) {
                                    return !item.text.includes('Target');
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const idx = context.dataIndex;
                                    const dsIdx = context.datasetIndex;
                                    const rawData = context.chart.config.data.customRawData;
                                    const targets = context.chart.config.data.customTargets;
                                    const item = rawData[idx];
                                    if (!item) return '';
                                    if (dsIdx === 0) return (currentLang === 'en' ? 'Fats: ' : 'Grassi: ') + Math.round(item.grassi || 0) + 'g / ' + targets.grassi + 'g';
                                    if (dsIdx === 1) return (currentLang === 'en' ? 'Carbs: ' : 'Carboidrati: ') + Math.round(item.carboidrati || 0) + 'g / ' + targets.carboidrati + 'g';
                                    if (dsIdx === 2) return (currentLang === 'en' ? 'Proteins: ' : 'Proteine: ') + Math.round(item.proteine || 0) + 'g / ' + targets.proteine + 'g';
                                    if (dsIdx === 3) return (currentLang === 'en' ? 'Calories Target: ' : 'Target Calorie: ') + targets.calorie + ' kcal';
                                    return '';
                                }
                            }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            stacked: true,
                            grid: { color: 'rgba(71,85,105,0.08)', drawTicks: false },
                            ticks: { display: false }
                        },
                        y: {
                            stacked: true,
                            type: 'linear',
                            position: 'left',
                            grid: { color: 'rgba(71,85,105,0.08)' },
                            ticks: { 
                                color: '#f43f5e', 
                                font: { size: 9, weight: 'bold' },
                                stepSize: calorieStepSize
                            },
                            min: 0,
                            max: maxCalValue,
                            title: {
                                display: true,
                                text: currentLang === 'en' ? 'Calories (kcal)' : 'Calorie (kcal)',
                                color: '#f43f5e',
                                font: { size: 9, weight: 'bold' }
                            },
                            afterFit: (scale) => { scale.width = 50; }
                        }
                    }
                }
            });

            // 2. Grafico Peso Corporeo (Bottom)
            monthPesoChart = new Chart(document.getElementById('monthPesoChart').getContext('2d'), {
                data: {
                    labels: labels,
                    customRawData: datiMensili,
                    datasets: [
                        {
                            type: 'line',
                            label: currentLang === 'en' ? 'Weight' : 'Peso Reale',
                            data: datiPeso,
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            borderWidth: 3,
                            pointRadius: 3,
                            pointBackgroundColor: '#6366f1',
                            fill: false,
                            spanGaps: true,
                            yAxisID: 'y'
                        },
                        {
                            type: 'line',
                            label: currentLang === 'en' ? 'Weight Target' : 'Obiettivo Peso',
                            data: labels.map(() => pTarget),
                            borderColor: '#6366f1',
                            borderWidth: 1.5,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: function (context) {
                                    const idx = context.dataIndex;
                                    const dsIdx = context.datasetIndex;
                                    const rawData = context.chart.config.data.customRawData;
                                    const item = rawData[idx];
                                    if (!item) return '';
                                    if (dsIdx === 0) return (currentLang === 'en' ? 'Weight: ' : 'Peso: ') + (item.peso ? item.peso.toFixed(1) + ' kg' : '--');
                                    if (dsIdx === 1) return (currentLang === 'en' ? 'Weight Target: ' : 'Obiettivo Peso: ') + pTarget + ' kg';
                                    return '';
                                }
                            }
                        }
                    },
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: 'rgba(71,85,105,0.08)' },
                            ticks: { color: '#64748b', font: { size: 9 } }
                        },
                        y: {
                            type: 'linear',
                            position: 'left',
                            grid: { color: 'rgba(71,85,105,0.08)' },
                            ticks: { 
                                color: '#6366f1', 
                                font: { size: 9, weight: 'bold' },
                                stepSize: pesoStepSize
                            },
                            min: yMin,
                            max: yMax,
                            title: {
                                display: true,
                                text: currentLang === 'en' ? 'Weight (kg)' : 'Peso (kg)',
                                color: '#6366f1',
                                font: { size: 9, weight: 'bold' }
                            },
                            afterFit: (scale) => { scale.width = 50; }
                        }
                    }
                }
            });
        }
        // ================================================================
        // ESPORTAZIONE / IMPORTAZIONE JSON DATABASE
        // ================================================================
        async function esportaDB() {
            try {
                const parsed = ottieniStatoCompletoDB();
                const formattedJson = JSON.stringify(parsed, null, 2);
                const blob = new Blob([formattedJson], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `nutritracker-backup-${ottieniDataOggi()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (err) {
                console.error("Errore durante l'esportazione:", err);
            }
        }

        window.applicaStatoImportato = function (json) {
            let diario = [];
            
            if (Array.isArray(json)) {
                // Vecchio formato (solo array del diario)
                diario = json;
            } else if (json && json.diario && Array.isArray(json.diario)) {
                // Nuovo formato (diario + impostazioni)
                diario = json.diario;
                if (json.impostazioni) {
                    for (const [key, val] of Object.entries(json.impostazioni)) {
                        if (val !== null && val !== undefined) {
                            localStorage.setItem(key, val);
                        }
                    }
                    
                    // Ricarica le variabili globali target
                    targetCalorie = parseInt(localStorage.getItem('target_calorie')) || 2000;
                    targetProteine = parseInt(localStorage.getItem('target_proteine')) || 160;
                    targetCarbo = parseInt(localStorage.getItem('target_carbo')) || 200;
                    targetGrassi = parseInt(localStorage.getItem('target_grassi')) || 70;
                    pesoTarget = parseFloat(localStorage.getItem('targetPeso')) || 75;

                    // Aggiorna i campi input dei target principali
                    document.getElementById('targetCalorie').value = targetCalorie;
                    document.getElementById('targetProteine').value = targetProteine;
                    document.getElementById('targetCarbo').value = targetCarbo;
                    document.getElementById('targetGrassi').value = targetGrassi;
                    document.getElementById('targetPeso').value = pesoTarget;

                    // Aggiorna i campi input del profilo AI
                    const pPeso = localStorage.getItem('profile_peso');
                    if (pPeso) document.getElementById('aiPeso').value = pPeso;
                    const pAltezza = localStorage.getItem('profile_altezza');
                    if (pAltezza) document.getElementById('aiAltezza').value = pAltezza;
                    const pAttivita = localStorage.getItem('profile_attivita');
                    if (pAttivita) document.getElementById('aiAttivita').value = pAttivita;
                    const pObiettivo = localStorage.getItem('profile_obiettivo');
                    if (pObiettivo) document.getElementById('aiObiettivo').value = pObiettivo;
                    const pPesoTarget = localStorage.getItem('profile_peso_target');
                    if (pPesoTarget) document.getElementById('aiPesoTarget').value = pPesoTarget;
                    const pSesso = localStorage.getItem('profile_sesso');
                    if (pSesso) document.getElementById('aiSesso').value = pSesso;
                    const pEta = localStorage.getItem('profile_eta');
                    if (pEta) document.getElementById('aiEta').value = pEta;

                    // Forza la traduzione dei testi appena importati
                    changeLanguage(window.currentLang);
                }
            } else {
                throw new Error("Formato file non valido");
            }

            // Salva il diario e attiva l'autosave locale
            salvaDatabase(diario);
        };

        function importaDB(event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const json = JSON.parse(e.target.result);
                    applicaStatoImportato(json);
                    await customAlert(currentLang === 'en' ? "Imported" : "Importazione", currentLang === 'en' ? "Database and settings successfully imported!" : "Database e impostazioni importati con successo!", true);
                    aggiornaTotaleGiorno();
                    caricaPesoDelGiorno();
                    if (document.getElementById('panel-storico').classList.contains('active')) renderStorico();
                    if (document.getElementById('panel-trend').classList.contains('active')) {
                        if (trendView === 'mesi') {
                            renderTrendMensile();
                        } else {
                            renderTrend();
                        }
                    }
                } catch (err) {
                    await customAlert(currentLang === 'en' ? "Read Error" : "Errore Lettura", currentLang === 'en' ? "Error reading or importing backup file." : "Errore nella lettura o importazione del file di backup.");
                }
            };
            reader.readAsText(file);
            document.getElementById('importInput').value = ""; // Clear
        }


        async function salvaPesoManuale() {
            const valoreInput = document.getElementById('input-peso-valore').value;
            const dataSelezionata = document.getElementById('input-peso-data').value;

            if (!valoreInput || !dataSelezionata) {
                await customAlert(
                    currentLang === 'en' ? "Missing data" : "Dati mancanti",
                    currentLang === 'en' ? "Please enter both a valid weight value and a date." : "Inserisci sia un valore di peso valido che una data."
                );
                return;
            }

            const pesoFlessibile = parseFloat(valoreInput);

            // Recupera il database reale dal localStorage
            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];

            // Cerca se esiste già quel giorno nel database log
            let giornoEsistente = db.find(g => g.data === dataSelezionata);

            if (giornoEsistente) {
                // Aggiorna il peso del giorno esistente
                giornoEsistente.peso = pesoFlessibile;
            } else {
                // Se il giorno non esiste, crealo inizializzando i parametri coerentemente con l'app
                db.push({
                    id: Date.now(),
                    data: dataSelezionata,
                    peso: pesoFlessibile,
                    calorie: 0,
                    proteine: 0,
                    carboidrati: 0,
                    grassi: 0,
                    pasti: []
                });
            }

            // Salva nel localStorage corretto usato dalla tua app
            salvaDatabase(db);

            // Rinfresca l'interfaccia corrente usando le funzioni reali del tuo codice
            aggiornaTotaleGiorno();

            // Se i pannelli Storico o Trend sono attivi, li aggiorna al volo
            if (document.getElementById('panel-storico').classList.contains('active')) renderStorico();
            if (document.getElementById('panel-trend').classList.contains('active')) {
                if (trendView === 'mesi') {
                    renderTrendMensile();
                } else {
                    renderTrend();
                }
            }

            await customAlert(
                currentLang === 'en' ? "Weight saved" : "Peso salvato",
                currentLang === 'en'
                    ? `Weight of ${pesoFlessibile} kg successfully saved for ${dataSelezionata}!`
                    : `Peso di ${pesoFlessibile} kg salvato correttamente per il giorno ${dataSelezionata}!`,
                true
            );

            // Pulisce il campo input del peso dopo il salvataggio
            document.getElementById('input-peso-valore').value = '';

            // Rigenera le icone se necessario
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }


        // Funzione per eliminare un singolo pasto specifico dallo Storico
        window.eliminaPasto = async function (dataPasto, pastoId) {
            const procedi = await customConfirm(
                currentLang === 'en' ? "Delete Meal" : "Elimina Pasto",
                currentLang === 'en' ? "Are you sure you want to delete this meal? Daily macros will be recalculated." : "Sei sicuro di voler eliminare questo pasto? I macro giornalieri verranno ricalcolati.",
                true,
                currentLang === 'en' ? "Delete" : "Elimina"
            );
            if (!procedi) return;

            let db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            let giorno = db.find(g => g.data === dataPasto);

            if (giorno && giorno.pasti) {
                // Filtra via il pasto rimosso
                giorno.pasti = giorno.pasti.filter(p => p.id !== pastoId);

                // Ricalcola i macro totali di quel giorno sottraendo il pasto eliminato
                giorno.calorie = giorno.pasti.reduce((sum, p) => sum + p.calorie, 0);
                giorno.proteine = giorno.pasti.reduce((sum, p) => sum + p.proteine, 0);
                giorno.carboidrati = giorno.pasti.reduce((sum, p) => sum + p.carboidrati, 0);
                giorno.grassi = giorno.pasti.reduce((sum, p) => sum + p.grassi, 0);

                // Salva le modifiche nel localStorage
                salvaDatabase(db);

                // Aggiorna tutta l'interfaccia utente
                aggiornaTotaleGiorno();
                renderStorico();
                if (document.getElementById('panel-trend').classList.contains('active')) {
                    if (trendView === 'mesi') {
                        renderTrendMensile();
                    } else {
                        renderTrend();
                    }
                }
            }
        };

        // ================================================================
        // SUPPORTO AI PER DEFINIZIONE TARGET
        // ================================================================
        window.toggleAiTargetBox = function () {
            const box = document.getElementById('aiTargetBox');
            if (box) {
                box.classList.toggle('hidden');
                if (!box.classList.contains('hidden')) {
                    const aiPesoInput = document.getElementById('aiPeso');
                    if (aiPesoInput && !aiPesoInput.value) {
                        const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
                        const giorniConPeso = db.filter(g => g.peso).sort((a, b) => new Date(b.data) - new Date(a.data));
                        if (giorniConPeso.length > 0) {
                            aiPesoInput.value = giorniConPeso[0].peso;
                        } else {
                            const currentTargetWeightVal = document.getElementById('targetPeso')?.value;
                            if (currentTargetWeightVal) {
                                aiPesoInput.value = currentTargetWeightVal;
                            }
                        }
                    }

                    const aiPesoTargetInput = document.getElementById('aiPesoTarget');
                    if (aiPesoTargetInput && !aiPesoTargetInput.value) {
                        const currentTargetWeightVal = document.getElementById('targetPeso')?.value;
                        if (currentTargetWeightVal) {
                            aiPesoTargetInput.value = currentTargetWeightVal;
                        }
                    }
                }
            }
        };

        let targetSuggeritiAI = null;

        window.generaTargetConAI = async function () {
            const peso = document.getElementById('aiPeso').value.trim();
            const pesoTargetInput = document.getElementById('aiPesoTarget').value.trim();
            const altezza = document.getElementById('aiAltezza').value.trim();
            const attivita = document.getElementById('aiAttivita').value.trim();
            const obiettivo = document.getElementById('aiObiettivo').value.trim();
            const sesso = document.getElementById('aiSesso').value;
            const eta = document.getElementById('aiEta').value.trim();

            if (!peso || !altezza || !attivita || !obiettivo || !eta) {
                await customAlert(
                    currentLang === 'en' ? "Incomplete fields" : "Campi incompleti",
                    currentLang === 'en' ? "Please fill in all the required fields (including Age) to allow the AI to calculate your targets!" : "Compila tutte le informazioni necessarie (inclusa l'Età) per consentire all'AI il calcolo!"
                );
                return;
            }

            const apiKey = localStorage.getItem('gemini_apikey');
            if (!apiKey) {
                await customAlert(
                    currentLang === 'en' ? "API Key missing" : "API Key mancante",
                    currentLang === 'en' ? "Please enter your Gemini API Key in the settings first!" : "Inserisci prima la tua Gemini API Key nelle impostazioni!"
                );
                return;
            }

            const btn = document.getElementById('btnGeneraTargetAI');
            const stato = document.getElementById('statoTargetAI');
            const resultsBox = document.getElementById('aiTargetResults');

            btn.disabled = true;
            btn.style.opacity = "0.6";
            stato.classList.remove('hidden');
            resultsBox.classList.add('hidden');

            const promptAI = `Sei un esperto nutrizionista e trainer sportivo. Calcola i target ideali giornalieri di calorie (kcal), proteine (g), carboidrati (g), grassi (g) e suggerisci un peso target (kg) indicativo basato sui dati dell'utente:
- Sesso biologico: ${sesso === 'donna' ? 'Femmina' : 'Maschio'}
- Età: ${eta} anni
- Peso attuale: ${peso} kg
${pesoTargetInput ? `- Peso target desiderato dall'utente: ${pesoTargetInput} kg` : ''}
- Altezza: ${altezza} cm
- Stile di vita e livello di attività fisica: ${attivita}
- Obiettivo principale: ${obiettivo}

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown, senza racchiuderlo in codice tipo \`\`\`json) contenente le seguenti chiavi numeriche: "calorie", "proteine", "carboidrati", "grassi", "pesoTarget". Il "pesoTarget" restituito deve essere possibilmente allineato a quello desiderato dell'utente se fornito, oppure ottimizzato/calibrato se irrealistico o non salutare a breve/medio termine. Sii accurato e realistico nei calcoli (es. proteine circa 1.6-2.2g per kg per aumento massa, grassi circa 0.8-1g per kg, calorie calibrate sul TDEE calcolato considerando il sesso biologico e l'età dell'utente).`;

            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptAI }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            temperature: 0.2
                        }
                    })
                });

                if (!response.ok) throw new Error("Errore nella risposta da Gemini API");
                const data = await response.json();
                const textResponse = data.candidates[0].content.parts[0].text.trim();
                const suggested = JSON.parse(textResponse);

                targetSuggeritiAI = suggested;

                document.getElementById('sugCal').innerText = Math.round(suggested.calorie) || 0;
                document.getElementById('sugPeso').innerText = suggested.pesoTarget || 0;
                document.getElementById('sugProt').innerText = Math.round(suggested.proteine) || 0;
                document.getElementById('sugCarb').innerText = Math.round(suggested.carboidrati) || 0;
                document.getElementById('sugFat').innerText = Math.round(suggested.grassi) || 0;

                resultsBox.classList.remove('hidden');
            } catch (error) {
                console.error(error);
                await customAlert(
                    currentLang === 'en' ? "Calculation error" : "Errore di calcolo",
                    currentLang === 'en' ? "An error occurred while calculating the AI targets. Check your API key and connection." : "Si è verificato un errore nel calcolo dei target con l'AI. Verifica la chiave API e la connessione."
                );
            } finally {
                btn.disabled = false;
                btn.style.opacity = "1";
                stato.classList.add('hidden');
            }
        };

        window.applicaTargetSuggeriti = async function () {
            if (!targetSuggeritiAI) return;

            document.getElementById('targetCalorie').value = Math.round(targetSuggeritiAI.calorie) || 2000;
            document.getElementById('targetProteine').value = Math.round(targetSuggeritiAI.proteine) || 160;
            document.getElementById('targetCarbo').value = Math.round(targetSuggeritiAI.carboidrati) || 200;
            document.getElementById('targetGrassi').value = Math.round(targetSuggeritiAI.grassi) || 70;
            document.getElementById('targetPeso').value = targetSuggeritiAI.pesoTarget || "";

            saveTarget();

            document.getElementById('aiTargetBox').classList.add('hidden');
            await customAlert(
                currentLang === 'en' ? "Targets Applied" : "Target Applicati",
                currentLang === 'en' ? "New AI targets applied and saved successfully!" : "Nuovi target AI applicati e salvati correttamente!",
                true
            );
        };

        // ================================================================
        // DETTATURA VOCALE SPEECH TO TEXT
        // ================================================================
        let voiceRecognition = null;
        let isVoiceListening = false;
        let currentTextareaId = null;
        let currentBtnId = null;

        window.toggleVoiceDictation = async function (textareaId, btnId) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                await customAlert("Dettatura non supportata", window.currentLang === 'en' ? "Voice dictation is not supported by this browser. Try Google Chrome or Safari." : "La dettatura vocale non è supportata da questo browser. Prova con Google Chrome o Safari.");
                return;
            }

            const btnMic = document.getElementById(btnId);
            const textarea = document.getElementById(textareaId);

            if (isVoiceListening && (currentTextareaId !== textareaId)) {
                if (voiceRecognition) voiceRecognition.stop();
            }

            if (!voiceRecognition) {
                voiceRecognition = new SpeechRecognition();
                voiceRecognition.continuous = false;
                voiceRecognition.interimResults = false;

                voiceRecognition.onstart = function () {
                    isVoiceListening = true;
                    const activeBtn = document.getElementById(currentBtnId);
                    const activeTextarea = document.getElementById(currentTextareaId);
                    if (activeBtn) {
                        activeBtn.classList.remove('text-slate-400', 'hover:text-indigo-400', 'bg-slate-800/80');
                        activeBtn.classList.add('text-red-400', 'bg-red-500/10', 'border-red-500/30', 'animate-pulse');
                    }
                    if (activeTextarea) {
                        activeTextarea.setAttribute('data-prev-placeholder', activeTextarea.placeholder || "");
                        activeTextarea.placeholder = window.currentLang === 'en' ? "Listening... speak now" : "Ascolto in corso... parla ora";
                    }
                };

                voiceRecognition.onerror = function (event) {
                    console.error("Errore riconoscimento vocale:", event.error);
                    stopListeningState();
                };

                voiceRecognition.onend = function () {
                    stopListeningState();
                };

                voiceRecognition.onresult = function (event) {
                    const activeTextarea = document.getElementById(currentTextareaId);
                    if (activeTextarea) {
                        const transcript = event.results[0][0].transcript;
                        if (activeTextarea.value.trim() === "") {
                            activeTextarea.value = transcript;
                        } else {
                            activeTextarea.value += " " + transcript;
                        }
                        activeTextarea.dispatchEvent(new Event('input'));
                    }
                };
            }

            function stopListeningState() {
                isVoiceListening = false;
                const activeBtn = document.getElementById(currentBtnId);
                const activeTextarea = document.getElementById(currentTextareaId);
                if (activeBtn) {
                    activeBtn.classList.add('text-slate-400', 'hover:text-indigo-400', 'bg-slate-800/80');
                    activeBtn.classList.remove('text-red-400', 'bg-red-500/10', 'border-red-500/30', 'animate-pulse');
                }
                if (activeTextarea) {
                    activeTextarea.placeholder = activeTextarea.getAttribute('data-prev-placeholder') || "";
                }
            }

            if (isVoiceListening) {
                voiceRecognition.stop();
            } else {
                currentTextareaId = textareaId;
                currentBtnId = btnId;
                try {
                    voiceRecognition.lang = window.currentLang === 'en' ? 'en-US' : 'it-IT';
                    voiceRecognition.start();
                } catch (e) {
                    console.error(e);
                }
            }
        };

        // ================================================================
        // CUSTOM DIALOGS: ALERT & CONFIRM MODALS
        // ================================================================
        let dialogPromiseResolve = null;

        window.customConfirm = function (title, message, isDanger = false, confirmText = "Conferma") {
            return new Promise((resolve) => {
                const modal = document.getElementById('dialogModal');
                const inner = document.getElementById('dialogInner');
                const titleEl = document.getElementById('dialogTitle');
                const msgEl = document.getElementById('dialogMessage');
                const btnConfirm = document.getElementById('dialogBtnConfirm');
                const btnCancel = document.getElementById('dialogBtnCancel');
                const icon = document.getElementById('dialogIcon');
                const iconContainer = document.getElementById('dialogIconContainer');

                titleEl.innerText = title;
                msgEl.innerText = message;
                btnConfirm.innerText = confirmText;
                btnCancel.classList.remove('hidden');

                if (isDanger) {
                    btnConfirm.className = "px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition cursor-pointer active:scale-95";
                    iconContainer.className = "p-2 rounded-xl bg-rose-500/10 border border-rose-500/20";
                    icon.className = "w-5 h-5 text-rose-400";
                    icon.setAttribute('data-lucide', 'alert-triangle');
                } else {
                    btnConfirm.className = "px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer active:scale-95";
                    iconContainer.className = "p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20";
                    icon.className = "w-5 h-5 text-indigo-400";
                    icon.setAttribute('data-lucide', 'help-circle');
                }

                if (typeof lucide !== 'undefined') lucide.createIcons();

                modal.classList.remove('hidden');
                setTimeout(() => {
                    inner.classList.remove('scale-95', 'opacity-0');
                    inner.classList.add('scale-100', 'opacity-100');
                }, 50);

                dialogPromiseResolve = resolve;

                btnConfirm.onclick = () => {
                    closeDialog(true);
                };
                btnCancel.onclick = () => {
                    closeDialog(false);
                };
            });
        };

        window.customAlert = function (title, message, isSuccess = false) {
            return new Promise((resolve) => {
                const modal = document.getElementById('dialogModal');
                const inner = document.getElementById('dialogInner');
                const titleEl = document.getElementById('dialogTitle');
                const msgEl = document.getElementById('dialogMessage');
                const btnConfirm = document.getElementById('dialogBtnConfirm');
                const btnCancel = document.getElementById('dialogBtnCancel');
                const icon = document.getElementById('dialogIcon');
                const iconContainer = document.getElementById('dialogIconContainer');

                titleEl.innerText = title;
                msgEl.innerText = message;
                btnConfirm.innerText = "OK";
                btnCancel.classList.add('hidden');

                if (isSuccess) {
                    btnConfirm.className = "px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition cursor-pointer active:scale-95";
                    iconContainer.className = "p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20";
                    icon.className = "w-5 h-5 text-emerald-400";
                    icon.setAttribute('data-lucide', 'check-circle');
                } else {
                    btnConfirm.className = "px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer active:scale-95";
                    iconContainer.className = "p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20";
                    icon.className = "w-5 h-5 text-indigo-400";
                    icon.setAttribute('data-lucide', 'info');
                }

                if (typeof lucide !== 'undefined') lucide.createIcons();

                modal.classList.remove('hidden');
                setTimeout(() => {
                    inner.classList.remove('scale-95', 'opacity-0');
                    inner.classList.add('scale-100', 'opacity-100');
                }, 50);

                dialogPromiseResolve = resolve;

                btnConfirm.onclick = () => {
                    closeDialog(true);
                };
            });
        };

        function closeDialog(value) {
            const modal = document.getElementById('dialogModal');
            const inner = document.getElementById('dialogInner');
            inner.classList.add('scale-95', 'opacity-0');
            inner.classList.remove('scale-100', 'opacity-100');
            setTimeout(() => {
                modal.classList.add('hidden');
                if (dialogPromiseResolve) {
                    dialogPromiseResolve(value);
                    dialogPromiseResolve = null;
                }
            }, 200);
        }

        // ================================================================
        // ANALISI ANDAMENTO STORICO CON AI
        // ================================================================
        window.analizzaTrendConAI = async function () {
            const geminiKey = localStorage.getItem('gemini_apikey');
            if (!geminiKey) {
                await customAlert("API Key mancante", currentLang === 'en' ? "Please insert your Gemini API Key in the settings first!" : "Inserisci prima la tua API Key nelle impostazioni (icona ingranaggio in alto).");
                return;
            }

            const btn = document.getElementById('btnAnalisiTrendAI');
            const label = document.getElementById('btnAnalisiTrendLabel');
            const box = document.getElementById('boxAnalisiTrendAI');
            const testo = document.getElementById('testoAnalisiTrendAI');

            btn.disabled = true;
            btn.style.opacity = "0.6";
            const prevLabelHTML = label.innerHTML;
            label.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 text-indigo-400 animate-spin"></i>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();

            box.classList.remove('hidden');
            testo.innerHTML = currentLang === 'en' ? `<span class="italic text-slate-400">The AI is analyzing your historical trends...</span>` : `<span class="italic text-slate-400">L'AI sta analizzando i tuoi andamenti storici...</span>`;

            // Raccogli i dati del database nutriDB
            const db = JSON.parse(localStorage.getItem('nutriDB')) || [];
            if (db.length === 0) {
                btn.disabled = false;
                btn.style.opacity = "1";
                label.innerHTML = prevLabelHTML;
                if (typeof lucide !== 'undefined') lucide.createIcons();
                testo.innerHTML = currentLang === 'en'
                    ? `<span class="italic text-rose-400">No data available in the diary to perform analysis.</span>`
                    : `<span class="italic text-rose-400">Nessun dato presente nel diario per effettuare l'analisi.</span>`;
                return;
            }

            // 1. Raccoglie dati a BREVE PERIODO (Ultimi 7 Giorni reali)
            let datiBrevePeriodo = "";
            let giorniRegistratiCount = 0;
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const costr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const trovato = db.find(x => x.data === costr);
                if (trovato && (trovato.calorie > 0 || trovato.proteine > 0 || trovato.pasti.length > 0)) {
                    if (currentLang === 'en') {
                        datiBrevePeriodo += `- Date ${costr}: Calories ${Math.round(trovato.calorie)} kcal, Proteins ${Math.round(trovato.proteine)}g, Carbs ${Math.round(trovato.carboidrati)}g, Fats ${Math.round(trovato.grassi)}g, Weight ${trovato.peso || 'not logged'} kg\n`;
                    } else {
                        datiBrevePeriodo += `- Data ${costr}: Calorie ${Math.round(trovato.calorie)} kcal, Proteine ${Math.round(trovato.proteine)}g, Carbo ${Math.round(trovato.carboidrati)}g, Grassi ${Math.round(trovato.grassi)}g, Peso ${trovato.peso || 'non registrato'} kg\n`;
                    }
                    giorniRegistratiCount++;
                } else {
                    datiBrevePeriodo += currentLang === 'en'
                        ? `- Date ${costr}: No data logged (ignore this day in analysis)\n`
                        : `- Data ${costr}: Nessun dato registrato (ignora questo giorno dall'analisi)\n`;
                }
            }

            // 2. Raccoglie dati a MEDIO PERIODO (Ultime 8 Settimane medie)
            let datiMedioPeriodo = "";
            let settimaneRegistrateCount = 0;
            const getWeekNumber = (date) => {
                const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                const dayNum = d.getUTCDay() || 7;
                d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
            };

            const formattaData = (d) => {
                const anno = d.getFullYear();
                const mese = String(d.getMonth() + 1).padStart(2, '0');
                const giorno = String(d.getDate()).padStart(2, '0');
                return `${anno}-${mese}-${giorno}`;
            };

            // Trova il lunedì della settimana corrente
            const lunedìCorrente = new Date();
            const day = lunedìCorrente.getDay();
            const diff = day === 0 ? 6 : day - 1;
            lunedìCorrente.setDate(lunedìCorrente.getDate() - diff);
            lunedìCorrente.setHours(0, 0, 0, 0);

            for (let w = 7; w >= 0; w--) {
                const inizioSettimana = new Date(lunedìCorrente);
                inizioSettimana.setDate(lunedìCorrente.getDate() - (w * 7));
                
                const fineSettimana = new Date(inizioSettimana);
                fineSettimana.setDate(inizioSettimana.getDate() + 6);

                const numSettimana = getWeekNumber(inizioSettimana);
                const inizioStr = formattaData(inizioSettimana);
                const fineStr = fineSettimana ? formattaData(fineSettimana) : formattaData(new Date());

                const recordSettimanali = db.filter(x => x.data >= inizioStr && x.data <= fineStr);

                const recordAttivi = recordSettimanali.filter(r => r.calorie > 0 || r.proteine > 0);
                const recordConPeso = recordSettimanali.filter(r => r.peso && r.peso > 0);

                if (recordAttivi.length > 0) {
                    const mediaC = recordAttivi.reduce((a, b) => a + (b.calorie || 0), 0) / recordAttivi.length;
                    const mediaP = recordAttivi.reduce((a, b) => a + (b.proteine || 0), 0) / recordAttivi.length;
                    const mediaCb = recordAttivi.reduce((a, b) => a + (b.carboidrati || 0), 0) / recordAttivi.length;
                    const mediaG = recordAttivi.reduce((a, b) => a + (b.grassi || 0), 0) / recordAttivi.length;
                    const mediaPeso = recordConPeso.length > 0 ? recordConPeso.reduce((a, b) => a + b.peso, 0) / recordConPeso.length : null;

                    if (currentLang === 'en') {
                        datiMedioPeriodo += `- Week ${numSettimana} (from ${inizioSettimana.toLocaleDateString('en-US')} to ${fineSettimana.toLocaleDateString('en-US')}): Average Calories ${Math.round(mediaC)} kcal/day, Proteins ${Math.round(mediaP)}g, Carbs ${Math.round(mediaCb)}g, Fats ${Math.round(mediaG)}g, Average Weight ${mediaPeso ? mediaPeso.toFixed(1) + ' kg' : 'not logged'}\n`;
                    } else {
                        datiMedioPeriodo += `- Settimana ${numSettimana} (da ${inizioSettimana.toLocaleDateString('it-IT')} a ${fineSettimana.toLocaleDateString('it-IT')}): Calorie medie ${Math.round(mediaC)} kcal/giorno, Proteine ${Math.round(mediaP)}g, Carbo ${Math.round(mediaCb)}g, Grassi ${Math.round(mediaG)}g, Peso medio ${mediaPeso ? mediaPeso.toFixed(1) + ' kg' : 'non registrato'}\n`;
                    }
                    settimaneRegistrateCount++;
                } else {
                    datiMedioPeriodo += currentLang === 'en'
                        ? `- Week ${numSettimana} (from ${inizioSettimana.toLocaleDateString('en-US')} to ${fineSettimana.toLocaleDateString('en-US')}): No data logged (ignore this week in analysis)\n`
                        : `- Settimana ${numSettimana} (da ${inizioSettimana.toLocaleDateString('it-IT')} a ${fineSettimana.toLocaleDateString('it-IT')}): Nessun dato registrato (ignora questa settimana dall'analisi)\n`;
                }
            }

            const promptAI = currentLang === 'en'
                ? `You are an expert clinical nutritionist and sports trainer. Analyze the user's recent meals and body weight trend over two time windows compared to their set targets.

User's current targets:
- Calories: ${targetCalorie} kcal
- Proteins: ${targetProteine} g
- Carbohydrates: ${targetCarbo} g
- Fats: ${targetGrassi} g
- Target Weight: ${pesoTarget} kg

SHORT-TERM Data (Last 7 Days, of which ${giorniRegistratiCount} have actual logs):
${datiBrevePeriodo}

MEDIUM-TERM Data (Last 8 Weeks, of which ${settimaneRegistrateCount} have actual logs):
${datiMedioPeriodo}

CRITICAL ANALYSIS RULES:
1. Be concise but explanatory (maximum 2-3 clear sentences per section).
2. DO NOT write a day-by-day or week-by-week report. DO NOT repeat, list, or quote specific dates or data received, but limit yourself to summarizing the global trend with a constructive and motivating tone.
3. Only consider the days/weeks where actual records exist.
4. If logging consistency is low, briefly encourage the user to log more regularly.

Provide a separate and compact evaluation, structured exactly as follows (maximum 2-3 sentences per section, use bold for titles):

**Short Term**: [Clear and conversational evaluation of recent calories and macronutrients].
**Medium Term**: [Clear and conversational evaluation of weight trend compared to the target].
**Advice**: [A practical, motivational, and immediate tip to optimize progress or consistency].`
                : `Sei un esperto nutrizionista clinico e trainer sportivo. Analizza l'andamento recente dei pasti e del peso corporeo dell'utente su due finestre temporali rispetto ai suoi target impostati.

Target attuali dell'utente:
- Calorie: ${targetCalorie} kcal
- Proteine: ${targetProteine} g
- Carboidrati: ${targetCarbo} g
- Grassi: ${targetGrassi} g
- Peso Target: ${pesoTarget} kg

Dati a BREVE PERIODO (Ultimi 7 Giorni, di cui ${giorniRegistratiCount} con dati effettivi):
${datiBrevePeriodo}

Dati a MEDIO PERIODO (Ultime 8 Settimane, di cui ${settimaneRegistrateCount} con dati effettivi):
${datiMedioPeriodo}

            REGOLE CRITICHE PER L'ANALISI:
            1. Sii sintetico ma esplicativo (massimo 2-3 frasi chiare per sezione).
            2. NON riportare analisi giorno per giorno o settimana per settimana. NON ripetere, elencare o citare date o dati specifici ricevuti, ma limitati a riassumere l'andamento globale con un tono costruttivo e motivante.
            3. Considera solo i giorni/settimane in cui ci sono delle registrazioni effettive.
            4. Se la costanza di inserimento è bassa, incoraggia brevemente l'utente a registrare con più regolarità.

            Fornisci una valutazione separata e compatta, strutturata esattamente come segue (massimo 2-3 frasi per sezione, usa il grassetto per i titoli):

            **Breve Periodo**: [Valutazione chiara e discorsiva sull'andamento calorico e macronutrienti recente].
            **Medio Periodo**: [Valutazione chiara e discorsiva sulla tendenza del peso rispetto al target].
            **Consiglio**: [Un suggerimento pratico, motivante e immediato per ottimizzare i progressi o la costanza].`;

            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: promptAI }] }]
                    })
                });
                if (!response.ok) throw new Error("Errore risposta server Gemini API");
                const data = await response.json();
                const rawResponse = data.candidates[0].content.parts[0].text;
                testo.innerHTML = rawResponse.replace(/\n/g, '<br>');
            } catch (err) {
                console.error(err);
                testo.innerHTML = currentLang === 'en'
                    ? `<span class="italic text-rose-400">An error occurred during analysis. Verify your internet connection or API key.</span>`
                    : `<span class="italic text-rose-400">Si è verificato un errore durante l'analisi. Verifica la tua connessione internet o la chiave API.</span>`;
            } finally {
                btn.disabled = false;
                btn.style.opacity = "1";
                label.innerHTML = prevLabelHTML;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        };
    
