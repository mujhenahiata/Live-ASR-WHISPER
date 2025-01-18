import React from 'react';
import LoginPage from './components/Login_page'; 
import JudgeDash from './components/Judge_dash'; 
import AdminDash from './components/Admin_dash';
import SignupPage from './components/Signup_page';
import Users from './components/Users';
import Roles from './components/Roles';
import AddCaseForm from './components/Case_form';
import Collaborators from './components/Collaborators';
import Stenographer from './components/Stenographer';
import CaseRecordings from './components/Case_recordings';

function App() {
  return (
    <div className="App">
      {/* Render the LoginPage component */}
      {/* To view every page change it with the required page you want to see */}
      {/* example : Login ---> LoginPage*/}
      <CaseRecordings/>
    </div>
  );
}

export default App;
