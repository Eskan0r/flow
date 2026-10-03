import { createBrowserRouter, RouterProvider } from "react-router";
import { Dailies } from "./routes/Dailies";
import { PackDetail } from "./routes/PackDetail";
import { PacksIndex } from "./routes/PacksIndex";
import { Play } from "./routes/Play";

const router = createBrowserRouter([
  { path: "/", element: <PacksIndex /> },
  { path: "/pack/:id", element: <PackDetail /> },
  { path: "/dailies", element: <Dailies /> },
  { path: "/play", element: <Play /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
