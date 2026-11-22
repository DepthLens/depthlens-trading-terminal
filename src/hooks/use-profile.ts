import { createContext, useContext } from "react";
import type { Profile } from "@/lib/session";

export const ProfileContext = createContext<Profile | null>(null);
export const useProfile = () => useContext(ProfileContext);
