module.exports = {
    darkMode: 'class', // Habilita o modo escuro baseado em classe
    content: [
      "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
      extend: {
        colors: {
          primary: '#ffa500', 
          gamecube: {
            primary: '#6A5ACD', // Cores do GameCube
            secondary: '#483D8B',
          },
          nintendo: {
            primary: '#e60012', // Cores do Nintendinho
            secondary: '#000000',
          },
          dark: {
            primary: '#1a1a1a', // Cores do tema escuro
            secondary: '#2c2c2c',
          },
          light: {
            primary: '#ffffff', // Cores do tema claro
            secondary: '#f0f0f0',
          },
          blue: {
            primary: '#007BFF', // Cores do tema azul
            secondary: '#0056b3',
          },
          custom: {
            // Tema personalizado adicional se necessário
          },
        },
      },
    },ugins: [],
  }