# Component Map: CertifyPro Frontend

The CertifyPro frontend is modular, using a composition-based architecture.

## 🧱 Core Components

### `Layout.jsx`
The primary application shell. 
- **Responsibilities**: Sticky Navigation, Brand Logo display, User Profile menu, Authentication state monitoring.
- **Special Logic**: Uses `no-print` classes to ensure the navigation bar is hidden during certificate printing.

### `App.jsx`
The central routing hub using `React Router`.
- **Protected Routes**: Wraps management pages in `ProtectedRoute` to ensure only logged-in users with valid Geo-access can enter.

---

## 📄 Page Components

### `CertificatePreview.jsx`
The most complex component in the system. It acts as a multi-engine renderer.
- **Renders**: Turnover, Net Worth, Utilisation, Rrera, NBFC, and GST certificates.
- **Logic**: Switches between specific View components based on `category` and `certificate_type`.
- **Printing**: Integrated with `react-to-print` to handle the A4 layout calculations.

### `History.jsx`
Audit dashboard for all users.
- **Features**: Filtering by date and category. View/Download buttons for each historical record.

---

## 📋 Form Components
Each form is specialized for its certificate category:

- **`TurnoverForm.jsx`**: Tabular entry for yearly financial figures.
- **`NetWorthForm.jsx`**: Multi-schedule entry (Schedule A, B, C) with live total calculations.
- **`Reraform7.jsx`**: Statutory RERA compliance form with extensive validation.
- **`LiquidAssets45IBForm.jsx`**: specialized RBI calculation form.
- **`Utilizationform.jsx`**: Tracking of fund utilization over multiple periods.

---

## 🛠 Shared Utilities

### `/src/lib/api.js`
A configured `axios` instance.
- **Interceptors**: Automatically attaches the Bearer token to every request and handles 401/403 errors globally (redirecting to Login).

### `/src/App.css`
Contains the **A4 Layout Engine**.
- Defines `.certificate-wrapper` (210mm width).
- Manages `@media print` rules for fixed headers/footers on multi-page PDF generation.
