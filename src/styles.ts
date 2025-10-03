import { StyleSheet } from "react-native";

export default StyleSheet.create({
  btn: (theme: "light" | "dark") => ({ 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    borderRadius: 10, 
    backgroundColor: theme === "dark" ? "#1f1f22" : "#fff",
    borderWidth: 1, 
    borderColor: "#1f1f22"
  }),
  btnText: (theme: "light" | "dark") => ({ 
    color: theme === "dark" ? "#fff" : "#1f1f22", 
    fontWeight: "700" 
  }),
  button: { 
    flex: 1, 
    paddingVertical: 14, 
    borderRadius: 16, 
    alignItems: "center", 
    backgroundColor: "#1f1f22" 
  },
  buttonDisabled: { opacity: 0 },
  buttonPrimary: { backgroundColor: "#4f46e5" },
  buttonText: { color: "#fff", fontWeight: "600" },
  buttonTextPrimary: { color: "#fff" },
  card: { 
    backgroundColor: "#0f0f12", 
    borderRadius: 16, 
    padding: 14, 
    borderWidth: 1, 
    borderColor: "#1f1f22" 
  },
  cardSub: { color: "#9ca3af", marginTop: 4 },
  cardTitle: { color: "#fff", fontWeight: "600" },
  container: { flex: 1 },
  controls : (theme: "light" | "dark") => ({ 
    backgroundColor: theme === "dark" ? "#000" : "#fff", 
    padding: 16,
    gap: 10,
    zIndex: 2
  }),
  darkBg: { backgroundColor: "#000" },
  header: { 
    paddingHorizontal: 16, 
    paddingTop: 8, 
    paddingBottom: 8, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between" 
  },
  headerRow: (theme: "light" | "dark") => ({ 
    paddingHorizontal: 16, 
    paddingBottom: 32,
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: theme === "dark" ? "#000" : "#fff", 
    gap: 8,
    zIndex: 2
  }),
  hint: (theme: "light" | "dark") => ({ 
    color: theme === "dark" ? "#9ca3af" : "#4b5563", 
    marginTop: 6 
  }),
  lightBg: { backgroundColor: "#fff" },
  logo: {
    width: 80,  // set explicit size!
    height: 80,
  },
  logoRow: (theme: "light" | "dark") => ({ 
    paddingTop: 8, 
    justifyContent: "center", // centers vertically
    alignItems: "center", 
    backgroundColor: theme === "dark" ? "#000" : "#fff", 
    zIndex: 2,
  }),
  metric: { 
    alignItems: "center",
    flex: 1 
  },
  metricLabel: (theme: "light" | "dark") => ({ 
    color: theme === "dark" ? "#fff" : "#a1a1aa", 
    fontSize: 12 
  }),
  metricValue: (theme: "light" | "dark") => ({
    color: theme === "dark" ? "#fff" : "#a1a1aa", 
    fontSize: 18, 
    marginTop: 2 
  }),
  metrics: (theme: "light" | "dark") => ({ 
    flexDirection: "row", 
    justifyContent: "space-between", 
    backgroundColor: theme === "dark" ? "#000" : "#fff", 
    zIndex: 2,
    paddingHorizontal: 16, 
    paddingVertical: 12 
  }),
  pill: { 
    paddingVertical: 10, 
    paddingHorizontal: 14, 
    borderRadius: 999, 
    backgroundColor: "#1f1f22" 
  },
  pillActive: (theme: "light" | "dark") => ({ 
    backgroundColor: theme === "dark" ? "#4f46e5" : "#6366f1" 
  }),
  pillText: (theme: "light" | "dark") => ({ 
    color: "#fff", 
    fontWeight: "700" 
  }),
  row: { flexDirection: "row", gap: 10 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  section: { padding: 16, gap: 10 },
  sectionTitle: (theme: "light" | "dark") => ({ 
    color: theme === "dark" ? "#e5e7eb" : "#111827", 
    fontSize: 14, 
    fontWeight: "700" 
  }),
  settingsButton: (theme: "light" | "dark") => ({ 
    backgroundColor: "transparent",
    borderColor: "transparent",
    color: theme === "dark" ? "#e5e7eb" : "#111827",
    fontFamily: "serif",
    textDecorationLine: "underline",
    fontSize: 14
  }),
  subtitle: { 
    color: "#a1a1aa",
    marginTop: 2, 
    paddingHorizontal: 16 
  },
  title: (theme: "light" | "dark") => ({ 
    fontFamily: "serif",
    color: theme === "dark" ? "#fff" : "#111", 
    fontSize: 20, 
    fontWeight: "800" 
  }),
});
