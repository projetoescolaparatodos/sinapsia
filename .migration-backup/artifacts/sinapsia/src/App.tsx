import { Switch, Route, Router as WouterRouter } from "wouter";
import HomePage from "@/pages/HomePage";
import BoardPage from "@/pages/BoardPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/b/:id" component={BoardPage} />
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
