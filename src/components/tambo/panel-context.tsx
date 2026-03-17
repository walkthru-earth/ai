"use client";

import { createContext, useContext } from "react";

/**
 * When true, the component is rendered inside a dashboard panel.
 * Components should hide their own header/chrome and let the panel header handle it.
 */
export const PanelContext = createContext(false);
export const useInDashboardPanel = () => useContext(PanelContext);
