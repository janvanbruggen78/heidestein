# 1) Update Expo itself to the latest for your SDK line
npx expo install expo@latest

# 2) Let Expo fix peer versions (RN, RN-Web, etc.)
npx expo install --fix

# 3) Update TypeScript + React types
npm i -D typescript@latest @types/react@latest @types/react-dom@latest

# 4) Clear caches & restart
rm -rf node_modules package-lock.json
npm install
npx expo start -c
