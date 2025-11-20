# 🎸 ChordBot Frontend (React + Tone.js)

Este repositório contém o Front-end do ChordBot, responsável pela interface do usuário e pela síntese de áudio em tempo real.

## 🔗 Dependência do Backend (API Python)

Este Front-end consome a API de Lógica Harmônica em Python, que deve estar rodando para que a música funcione.

1.  **Backend URL:** `http://127.0.0.1:5000`
2.  **Repositório do Backend:** [Link para o seu repositório chordbot-backend]

## 🛠️ Configuração e Execução

### Pré-requisitos
* Node.js (versão LTS recomendada)
* NPM (gerenciador de pacotes)

### Passos:

1.  **Clone o Repositório:**
    ```bash
    git clone [https://github.com/anamariasilva/front-end](https://github.com/anamariasilva/front-end)
    cd chordbot-frontend
    ```

2.  **Instale as Dependências (Node/JS):**
    ```bash
    npm install
    ```

3.  **Inicie o Servidor Flask (em outra janela do terminal):**
    Vá para o diretório do backend e execute:
    ```bash
    python api_server.py 
    ```

4.  **Inicie o Frontend:**
    ```bash
    npm run dev
    ```
    O Vite iniciará o servidor de desenvolvimento, geralmente em `http://localhost:5173/` (verifique o terminal).