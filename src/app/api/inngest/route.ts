import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";
import { documentMailFunctions } from "@/inngest/document-mail-functions";

export const maxDuration = 60;
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...functions, ...documentMailFunctions],
});
