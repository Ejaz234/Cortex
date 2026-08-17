# Cortex 🧠

Cortex is an AI-powered codebase explorer that helps developers understand GitHub repositories through intelligent search, repository indexing, and AI-powered conversations.

Connect a public GitHub repository, and Cortex analyzes the codebase so you can ask questions and explore how the project works.

---

## ✨ Features

- 🔐 User authentication with Clerk
- 📂 Connect and manage GitHub repositories
- 🗑️ Delete projects from your workspace
- 🔄 Clone and index repository files
- ✂️ Split source code into searchable chunks
- 🧠 Generate vector embeddings for code
- 🔎 Semantic search using pgvector
- 💬 Ask AI questions about a repository
- 📊 Understand project structure and functionality
- 📝 Sync and explore Git commit history
- 🤖 AI-powered repository insights using RAG

---

## 🏗️ How It Works

```text
GitHub Repository
        │
        ▼
 Clone Repository
        │
        ▼
 Extract & Chunk Files
        │
        ▼
 Generate Embeddings
        │
        ▼
 Store in PostgreSQL + pgvector
        │
        ▼
 User asks a question
        │
        ▼
 Semantic Search (RAG)
        │
        ▼
 AI generates an answer
```

---

## 🛠️ Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- React Router
- Clerk
- Lucide Icons

### Backend

- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL
- Supabase
- pgvector

### AI & RAG
- Google Gemini
- LangChain
- Embeddings
- Retrieval-Augmented Generation (RAG)
- pgvector
- Vector Similarity Search

### Database & Infrastructure
- PostgreSQL
- Supabase
- Prisma
- GitHub API

---

## 📁 Project Structure

```text
Cortex
├── frontend
│   ├── src
│   │   ├── components
│   │   ├── lib
│   │   └── pages
│   └── package.json
│
├── backend
│   ├── prisma
│   ├── src
│   │   ├── config
│   │   ├── lib
│   │   ├── middleware
│   │   ├── routes
│   │   └── services
│   └── package.json
│
└── README.md
```

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/Ejaz234/Cortex.git
cd Cortex
```

### 2. Install backend dependencies

```bash
cd backend
npm install
```

### 3. Configure backend environment variables

Create a `.env` file inside the `backend` directory and add the required environment variables.

Example:

```env
DATABASE_URL=
DIRECT_URL=

CLERK_SECRET_KEY=

GITHUB_TOKEN=

# AI provider keys
GEMINI_API_KEY=
```

> The exact environment variables may depend on your configured AI provider and deployment setup.

### 4. Run Prisma migrations

```bash
npx prisma migrate deploy
```

For local development:

```bash
npx prisma migrate dev
```

### 5. Start the backend

```bash
npm run dev
```

---

## 💻 Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env` file inside the `frontend` directory:

```env
VITE_CLERK_PUBLISHABLE_KEY=
VITE_API_URL=
```

Then start the frontend:

```bash
npm run dev
```

---

## 🧠 RAG Pipeline

When a repository is added to Cortex:

1. The GitHub repository is cloned.
2. Supported files are extracted.
3. Large files are split into smaller chunks.
4. Embeddings are generated for each chunk.
5. The embeddings are stored using PostgreSQL and pgvector.
6. When the user asks a question, relevant code chunks are retrieved using semantic similarity search.
7. The relevant repository context is provided to the AI model.
8. The AI generates an answer based on the codebase.

---

## 🔒 Environment Variables

Environment files are intentionally excluded from Git.

Make sure you configure the required variables before running or deploying the application.

```text
backend/.env
frontend/.env




⭐ If you found this project interesting, consider giving the repository a star!
