import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DragTestWindow } from "./components/DragTestWindow";

const isTestWin = typeof window !== "undefined" && window.location.search.includes("drag-test=1");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isTestWin ? <DragTestWindow /> : <App />}
  </React.StrictMode>,
);
