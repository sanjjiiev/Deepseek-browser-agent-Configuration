# 🚀 DeepSeek Agent – Customized Edition

A fully autonomous, **completely free** AI coding agent that lives in your terminal, powered by DeepSeek's web interface. Enhanced with **folder isolation**, **manual approval prompts**, **Deep Think (R1) mode**, and **persistent per-project sessions**.

> Built on top of **deepseek-browser-agent** – all credits to the original author. This repo contains my customizations to make it production-ready, secure, and developer-friendly.

---

## ✨ Features

| Feature | Description |
| :--- | :--- |
| **🔒 Folder Guard** | Mathematically locked to your project folder – cannot read/write/delete outside it. |
| **🛡️ Manual Approval** | Every file write, deletion, and terminal command requires your `y`/`n`/`a` confirmation. |
| **🧠 Deep Think R1** | Uses DeepSeek's most powerful reasoning model for deeper code analysis. |
| **💾 Persistent Sessions** | Per-project chat history – pick up exactly where you left off. |
| **🖱️ Interactive Chat Control** | Click any conversation in the sidebar – the agent sends messages to the active chat. |
| **💰 100% Free** | No API keys, no subscriptions, no token limits. |
| **🔐 Total Privacy** | Everything runs locally – no telemetry, no third-party logging. |
| **📦 Full Toolset** | Read/write files, run commands, search code, list directories, replace text, and more. |

---

## 📂 Repository Contents

This repo contains the **4 customized source files** that replace the originals in `deepseek-browser-agent`:

| File | What It Does |
| :--- | :--- |
| `config.js` | Enables Deep Think (R1), per-project sessions, and loads user settings. |
| `tools.js` | Adds the folder guard and manual confirmation prompts for every file/command. |
| `browser.js` | Handles browser automation, dismisses restore notifications, and keeps the connection alive. |
| `agent.js` | Manages interactive mode – opens fresh chats by default, lets you manually switch conversations. |

---

## 🛠️ Installation & Setup

### Prerequisites

- Node.js (v18 or higher)
- A free DeepSeek account at [chat.deepseek.com](https://chat.deepseek.com)

### Step 1: Install the Base Agent

```bash
npm install -g deepseek-browser-agent
