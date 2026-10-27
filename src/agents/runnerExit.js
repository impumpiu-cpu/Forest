// The exit hooks of the job runners: (w, a, task, outcome) by the runner's id — agents/jobRunners.js registers them,
// agents/lifecycle.js calls them when a job ends. A module of its own, importing nothing: whichever of the two loads
// first, the registry is there (the two import each other through agents/tasks.js).
export const RUNNER_EXIT = {};
