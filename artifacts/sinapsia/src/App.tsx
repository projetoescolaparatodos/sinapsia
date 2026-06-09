import { Switch, Route, Router as WouterRouter } from "wouter";
import HomePage from "@/pages/HomePage";
import BoardPage from "@/pages/BoardPage";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/b/:id" component={BoardPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}

export default App;
