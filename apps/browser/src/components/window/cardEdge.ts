import { createContext, useContext } from "react";
import type { Animated } from "react-native";
import { layout } from "../ui/theme";

export type CardRadius = number | Animated.AnimatedInterpolation<number>;

export const CardRadiusContext = createContext<CardRadius>(layout.cardRadius);

export const useCardRadius = () => useContext(CardRadiusContext);
