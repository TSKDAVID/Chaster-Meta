import type { ChasterTool } from "@/ai/tools/types";

export const getBusinessHoursTool: ChasterTool = {
  name: "get_business_hours",
  moduleId: "hours",
  intents: ["hours_location"],
  definition: {
    type: "function",
    function: {
      name: "get_business_hours",
      description:
        "Get this Page's opening hours, timezone, and any hours note. Call when the customer asks if you are open or for schedule details.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.pageProfile),
  async run(_args, ctx) {
    const p = ctx.pageProfile!;
    return {
      ok: true,
      timezone: p.timezone,
      open_time: p.open_time,
      close_time: p.close_time,
      open_days: p.open_days,
      hours_note: p.hours_note,
    };
  },
};

export const getBusinessLocationTool: ChasterTool = {
  name: "get_business_location",
  moduleId: "hours",
  intents: ["hours_location"],
  definition: {
    type: "function",
    function: {
      name: "get_business_location",
      description:
        "Get this Page's address, maps link, phone, and email. Call for where / how to reach you questions.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.pageProfile),
  async run(_args, ctx) {
    const p = ctx.pageProfile!;
    return {
      ok: true,
      address_line: p.address_line,
      city: p.city,
      region: p.region,
      postal_code: p.postal_code,
      country: p.country,
      maps_url: p.maps_url,
      phone: p.phone,
      email: p.email,
    };
  },
};

export const HOURS_TOOLS: ChasterTool[] = [
  getBusinessHoursTool,
  getBusinessLocationTool,
];
