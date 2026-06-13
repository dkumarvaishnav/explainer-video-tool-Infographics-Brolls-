# Obvious Infographics — Explainer Video Tool

A modern, professional web application designed to automate the process of planning and generating visuals for explainer videos. Using Google's Gemini LLM, it processes video scripts or subtitle files (SRT) and translates them into structured scene-by-scene visual plans and optimized image generation prompts.

---

## 🚀 Key Features

* **Script & Subtitle Parsing**: Import raw text scripts or timecoded SRT files.
* **AI Scene Mapping (Gemini)**: Automatically distributes the script into a sequential timeline of **Infographics** and **B-roll** scenes.
* **Dynamic Workspace Editor**:
  * Customizable grid layouts (stacked, column, split view) with resizable headers and panels.
  * Interactive drag-and-drop panel ordering.
  * Real-time Details Editor panel to customize type, ratio, description, and source lines.
* **AI Copilot Chat**: Conversational AI assistant allowing you to edit, insert, split, or merge scenes using natural language instructions.
* **Prompt Engineering Hub**: Generate styled, ready-to-copy prompts tailored for AI image generators (e.g., Midjourney, Stable Diffusion).
* **Multi-Format Exporting**: Save your final prompt manifest as formatted Text (`.txt`) or structured Markdown (`.md`).
* **Interactive Design System**: Sleek modern UI featuring premium dark/light mode toggles, color accent configurations (teal, violet, amber), and dense/roomy UI densities.

---

## 🛠️ Technology Stack

* **Frontend**: HTML5, Vanilla CSS3 (custom HSL/OKLCH color system), React (loaded via browser-side scripts for lightweight hosting).
* **Backend**: Python 3.10+, FastAPI (Asynchronous REST API), Uvicorn.
* **LLM Integration**: Google GenAI SDK (`google-genai`) powered by Gemini.
* **State Management**: In-memory JSON session store with asynchronous locks for thread-safe operations.

---

## 💻 Installation & Local Setup

### Prerequisites
* Python 3.10 or higher installed.
* A Gemini API key.

### Setup Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/yourusername/explainer-video-tool.git
   cd explainer-video-tool
   ```

2. **Configure Environment Variables**:
   Copy the example template and fill in your Gemini API key:
   ```bash
   cp .env.example .env
   ```
   Open the new `.env` file and replace `your_gemini_api_key_here` with your actual key:
   ```env
   GEMINI_API_KEY=AIzaSy...
   ```

3. **Install Dependencies**:
   Create a virtual environment and install Python packages:
   ```bash
   # On Windows (PowerShell/CMD)
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt

   # On macOS/Linux
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

4. **Run the Application**:
   Start the FastAPI server:
   ```bash
   python -m backend.main
   ```
   *Note: Server hot-reloads automatically when files are changed.*

5. **Access the App**:
   Open your browser and navigate to:
   ```
   http://localhost:8000
   ```

---

## 📂 Project Structure

```text
├── backend/                  # FastAPI Application Source
│   ├── main.py               # Main API router and routes definition
│   ├── llm_service.py        # Gemini interaction and prompt generation
│   ├── session_store.py      # Async session caching & JSON persistence
│   ├── schemas.py            # Pydantic request & response models
│   ├── script_parser.py      # Script paragraph parsing engine
│   └── srt_parser.py         # Subtitle parsing engine
│
├── frontend/                 # Static Frontend Web App
│   ├── index.html            # Main web layout
│   ├── app.js                # React main App Shell component
│   └── components/           # Modular React components (.jsx)
│       ├── UploadScreen.jsx  # Script ingestion phase
│       ├── MappingScreen.jsx # Grid view and chat workflow editor
│       ├── PromptScreen.jsx  # Midjourney prompt copier & exporter
│       └── Shared.jsx        # Global typography, color theme tokens, and icons
│
├── sessions/                 # Local directory for session state JSON files (gitignored)
├── .env.example              # Template file for local environment config
└── requirements.txt          # Python dependencies manifest
```

---

## 🔒 Security & Best Practices

* **Zero Hardcoded Secrets**: All API keys are loaded dynamically from `.env` environment variables. Never commit your `.env` file.
* **Safe Session Handling**: Active sessions, text inputs, and generation histories are cached locally in the `sessions/` directory, which is excluded from source control.
* **XSS Defended UI**: Descriptions and AI-generated outputs are rendered in a safe, read-only manner on card layouts to prevent DOM injections.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
