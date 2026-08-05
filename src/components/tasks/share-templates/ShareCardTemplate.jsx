import React from "react";
import ClassicTemplate from "./ClassicTemplate";
import DateTemplate from "./DateTemplate";
import WorkTemplate from "./WorkTemplate";
import RoommateTemplate from "./RoommateTemplate";

const TEMPLATES = { brand: ClassicTemplate, date: DateTemplate, work: WorkTemplate, roommate: RoommateTemplate };

export default function ShareCardTemplate({ sceneId, ...data }) {
  const Template = TEMPLATES[sceneId] || ClassicTemplate;
  return <Template data={data} />;
}