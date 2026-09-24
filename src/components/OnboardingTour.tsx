"use client";

import { useEffect } from "react";
import { driver } from "driver.js";
import { useI18n } from "@/components/I18nProvider";
import { isTourDone, markTourDone } from "@/lib/prefs";

type Props = {
  runToken: number;
  force?: boolean;
};

export default function OnboardingTour({ runToken, force = false }: Props) {
  const { t } = useI18n();

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
      nextBtnText: t("tour.next"),
      prevBtnText: t("tour.back"),
      doneBtnText: t("tour.finish"),
      onDestroyStarted: () => {
        if (!tour.isActive()) return;
        markTourDone();
        tour.destroy();
      },
      onPopoverRender: (popover) => {
        // Make the built-in close control read as Skip
        const closeBtn = popover.closeButton;
        if (closeBtn) {
          closeBtn.setAttribute("aria-label", t("tour.skipTour"));
          closeBtn.title = t("tour.skipTour");
        }

        // Add an explicit Skip button in the footer (once)
        if (popover.footerButtons.querySelector("[data-tour-skip]")) return;
        const skip = document.createElement("button");
        skip.type = "button";
        skip.textContent = t("tour.skip");
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
            title: t("tour.welcomeTitle"),
            description: t("tour.welcomeBody"),
          },
        },
        {
          element: "[data-tour='profile']",
          popover: {
            title: t("tour.pageMenuTitle"),
            description: t("tour.pageMenuBody"),
            side: "bottom",
          },
        },
        {
          element: "[data-tour='inbox']",
          popover: {
            title: t("tour.inboxTitle"),
            description: t("tour.inboxBody"),
            side: "right",
          },
        },
        {
          element: "[data-tour='channel-filter']",
          popover: {
            title: t("tour.channelsTitle"),
            description: t("tour.channelsBody"),
            side: "bottom",
          },
        },
        {
          element: "[data-tour='thread']",
          popover: {
            title: t("tour.threadTitle"),
            description: t("tour.threadBody"),
            side: "left",
          },
        },
        {
          element: "[data-tour='ai-controls']",
          popover: {
            title: t("tour.aiTitle"),
            description: t("tour.aiBody"),
            side: "bottom",
          },
        },
        {
          element: "[data-tour='knowledge-toggle']",
          popover: {
            title: t("tour.faqsTitle"),
            description: t("tour.faqsBody"),
            side: "bottom",
          },
        },
        {
          element: "[data-tour='profile']",
          popover: {
            title: t("tour.themesTitle"),
            description: t("tour.themesBody"),
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
            title: t("theme.theme"),
            description: t("tour.themesBody"),
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
  }, [runToken, force, t]);

  return null;
}
