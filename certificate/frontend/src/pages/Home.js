import { Link } from "react-router-dom";
import { FileText, TrendingUp, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const Home = () => {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-4">
            Professional Certificate
            <span className="block text-primary mt-2">Generation Platform</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Generate official Net Worth and Turnover certificates with ease.
            Trusted by Chartered Accountants and Financial Professionals.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <Link to="/networth" data-testid="networth-card-link">
            <div className="group relative bg-card border border-border rounded-xl p-8 hover:shadow-2xl transition-all duration-300 hover:border-primary h-full cursor-pointer">
              <div className="absolute top-8 right-8 w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-display font-semibold text-foreground">
                  Net Worth Certificate
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Generate comprehensive net worth certificates with 5 years of financial data including Total Assets, Total Liabilities, and Net Worth calculations.
                </p>
                <div className="pt-4">
                  <Button 
                    data-testid="create-networth-btn"
                    className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    variant="outline"
                  >
                    Create Certificate
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/turnover" data-testid="turnover-card-link">
            <div className="group relative bg-card border border-border rounded-xl p-8 hover:shadow-2xl transition-all duration-300 hover:border-secondary h-full cursor-pointer">
              <div className="absolute top-8 right-8 w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <TrendingUp className="h-8 w-8 text-secondary" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-display font-semibold text-foreground">
                  Turnover Certificate
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Generate official turnover certificates with gross turnover data for 3 or more financial years. Flexible year selection for your needs.
                </p>
                <div className="pt-4">
                  <Button 
                    data-testid="create-turnover-btn"
                    className="group-hover:bg-secondary group-hover:text-secondary-foreground transition-colors"
                    variant="outline"
                  >
                    Create Certificate
                    <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="mt-20 text-center">
          <div className="max-w-3xl mx-auto bg-primary/5 border border-primary/20 rounded-xl p-8">
            <h3 className="text-2xl font-display font-semibold text-foreground mb-4">
              Features
            </h3>
            <div className="grid md:grid-cols-3 gap-6 text-left">
              <div>
                <h4 className="font-semibold text-foreground mb-2">Professional Format</h4>
                <p className="text-sm text-muted-foreground">Official format matching chartered accountant standards</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Print & PDF</h4>
                <p className="text-sm text-muted-foreground">Download as PDF or print directly from your browser</p>
              </div>
              <div>
                <h4 className="font-semibold text-foreground mb-2">Certificate History</h4>
                <p className="text-sm text-muted-foreground">Access all your previously generated certificates</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
