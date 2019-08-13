import { SearchResult } from '@pnp/sp';
import { IColumn } from 'office-ui-fabric-react/lib/DetailsList';
import { IFilterProps } from '../../../components/FilterPanel';
import { IPortfolioOverviewConfiguration, PortfolioOverviewColumn, PortfolioOverviewView } from '../config';
import { IPortfolioOverviewErrorMessage } from './IPortfolioOverviewErrorMessage';

export interface IPortfolioOverviewState {
    isLoading?: boolean;
    isChangingView?: PortfolioOverviewView;
    configuration?: IPortfolioOverviewConfiguration;
    items?: SearchResult[];
    columns?: IColumn[];
    searchTerm?: string;
    filters?: IFilterProps[];
    currentView?: PortfolioOverviewView;
    activeFilters?: { [key: string]: string[] };
    error?: IPortfolioOverviewErrorMessage;
    showFilterPanel?: boolean;
    groupBy?: PortfolioOverviewColumn;
    sortBy?: PortfolioOverviewColumn;
    showProjectInfo?: SearchResult;
    excelExportStatus?: any;
    canUserManageWeb?: boolean;
}