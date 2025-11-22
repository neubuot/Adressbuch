# Contributing to P2P Adressbuch

Vielen Dank für dein Interesse an diesem Projekt!

## Entwicklung

### Setup

```bash
npm install
cd signaling-server && npm install && cd ..
```

### Entwicklung starten

Terminal 1 (Signaling-Server):
```bash
cd signaling-server
npm start
```

Terminal 2 (Frontend):
```bash
npm run dev
```

### Tests ausführen

```bash
# Unit-Tests
npm test

# E2E-Tests
npm run test:e2e
```

### Code-Stil

- TypeScript strict mode
- ESLint für Linting
- Prettier für Formatierung (optional)

## Pull Requests

1. Fork das Repository
2. Erstelle einen Feature-Branch (`git checkout -b feature/AmazingFeature`)
3. Committe deine Änderungen (`git commit -m 'Add some AmazingFeature'`)
4. Push zum Branch (`git push origin feature/AmazingFeature`)
5. Öffne einen Pull Request

## Issues

Bitte verwende die Issue-Templates auf GitHub.
