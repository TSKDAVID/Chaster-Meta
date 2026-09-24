"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import { isTourDone, markTourDone } from "@/lib/prefs";

type Props = {
  runToken: number;
  force?: boolean;
};

export default function OnboardingTour({ runToken, force = false }: Props) {
  useEffect(() => {
    if (!force && isTourDone()) return;

    const tour = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 12,
      showButtons: ["next", "previous", "close"],
      nextBtnText: "Next",
      prevBtnText: "Back",
      doneBtnText: "Finish",
      onDestroyStarted: () => {
        if (!tour.isActive()) return;
        markTourDone();
        tour.destroy();
      },
      onPopoverRender: (popover) => {
        // Make the built-in close control read as Skip
        const closeBtn = popover.closeButton;
        if (closeBtn) {
          closeBtn.setAttribute("aria-label", "Skip tour");
          closeBtn.title = "Skip tour";
        }

        // Add an explicit Skip button in the footer (once)
        if (popover.footerButtons.querySelector("[data-tour-skip]")) return;
        const skip = document.createElement("button");
        skip.type = "button";
        skip.textContent = "Skip";
        skip.dataset.tourSkip = "1";
        skip.className = "driver-popover-skip-btn";
        skip.addEventListener("click", () => {
          markTourDone();
          tour.destroy();
        });
        popover.footerButtons.prepend(skip);
      },
      steps: [
        {
          popover: {
            title: "Welcome to Chaster",
            description:
              "This desk connects your Facebook Page, receives Messenger (and Instagram) chats, and lets AI reply using your FAQ knowledge.",
          },
        },
        {
          element: "[data-tour='profile']",
          popover: {
            title: "Page, profile & settings",
            description:
              "Connect or switch Facebook Pages here, pick a theme, set AI defaults, or restart this tour.",
            side: "bottom",
          },
        },
        {
          element: "[data-tour='inbox']",
          popover: {
            title: "Your inbox",
            description:
              "New customer chats land here after the webhook receives them. Search by ID or message text.",
            side: "right",
          },
        },
        {
          element: "[data-tour='channel-filter']",
          popover: {
            title: "Messenger vs Instagram",
            description:
              "Filter by channel. Each chat shows a Messenger or Instagram icon so you always know the source.",
            side: "bottom",
          },
        },
        {
          element: "[data-tour='thread']",
          popover: {
            title: "Conversation thread",
            description:
              "Open a chat to read history and send replies with Meta’s Send API.",
            side: "left",
          },
        },
        {
          element: "[data-tour='ai-controls']",
          popover: {
            title: "AI controls",
            description:
              "Handover to human pauses AI. Continue with AI turns it back on. End chat summarizes and suggests FAQs.",
            side: "bottom",
          },
        },
        {
          element: "[data-tour='knowledge-toggle']",
          popover: {
            title: "FAQs",
            description:
              "Tap FAQs to add answers your Page should know. The AI uses these when customers message you. Approve end-chat suggestions here too.",
            side: "bottom",
          },
        },
        {
          element: "[data-tour='profile']",
          popover: {
            title: "Themes",
            description:
              "Open the menu again and pick a theme — Light, Dark, or a colored look. Your choice is saved in this browser.",
            side: "bottom",
            onNextClick: (_el, _step, { driver: d }) => {
              const btn = document.querySelector(
                "[data-tour='profile'] > button",
              ) as HTMLButtonElement | null;
              btn?.click();
              window.setTimeout(() => {
                const themeTrigger = document.querySelector(
                  "[data-tour-theme-trigger]",
                ) as HTMLButtonElement | null;
                if (themeTrigger?.getAttribute("aria-expanded") !== "true") {
                  themeTrigger?.click();
                }
                d.moveNext();
              }, 220);
            },
          },
        },
        {
          element: "[data-tour='theme']",
          popover: {
            title: "Choose your theme",
            description:
              "Tap Select theme for Light, Dark, or a colored look. Your choice is saved in this browser.",
            side: "left",
          },
        },
      ],
    });

    const id = window.setTimeout(() => tour.drive(), 400);
    return () => {
      window.clearTimeout(id);
      tour.destroy();
    };
  }, [runToken, force]);

  return null;
}
