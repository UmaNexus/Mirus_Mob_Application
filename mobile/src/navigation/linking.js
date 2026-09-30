/**
 * Deep-linking configuration for React Navigation 7.
 * Supports URL schemes: mirus:// and https://mirus.app
 */
const linking = {
  prefixes: ['mirus://', 'https://mirus.app'],
  config: {
    screens: {
      HomeTab: {
        screens: {
          BdmHome: 'bdm/home',
          ManagerHome: 'manager/home',
          ExecutiveHome: 'executive/home',
          Notifications: 'notifications',
        },
      },
      ApprovalsTab: {
        screens: {
          ApprovalsMain: 'manager/approvals',
          MtpReview: 'manager/approvals/mtp/:planId',
        },
      },
      MtpTab: {
        screens: {
          Mtp: 'bdm/mtp',
          TourDetail: 'bdm/mtp/:planId',
        },
      },
      DoctorsTab: {
        screens: {
          DoctorsList: 'bdm/doctors',
          DoctorDetail: 'bdm/doctors/:doctorId',
        },
      },
      DcrTab: {
        screens: {
          DcrList: 'bdm/dcr',
          DcrDetail: 'bdm/dcr/:dcrId',
        },
      },
      MoreTab: {
        screens: {
          Alerts: 'alerts',
          ApplyLeave: 'bdm/leave',
          Expenses: 'bdm/expenses',
          Calendar: 'calendar',
          SecondarySales: 'bdm/secondary-sales',
          DcrReviewDetail: 'manager/dcr-review/:userId/:dateKey',
        },
      },
    },
  },
};

export default linking;
